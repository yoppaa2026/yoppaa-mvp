// LA RÉCOMPENSE DE FIDÉLITÉ, CÔTÉ SERVEUR (service_role uniquement).
//
// ⚠️ ARBITRAGE D'ALEX, 24/08 : **la récompense ne se dépense en ligne que pour
// un Yopper CONNECTÉ**, sur les numéros PROUVÉS par ses commandes passées.
//
// Ce n'est pas une demi-mesure, c'est la seule version sûre. La carte a pour
// clé un NUMÉRO DE GSM, et aucun flux de vérification par SMS n'existe dans le
// projet. Proposer la récompense sur un numéro simplement TAPÉ dans le tunnel,
// c'est rendre n'importe quel numéro interrogeable : on essaie celui de son
// voisin, on voit le prix baisser de 5 €, et on apprend qu'il a une carte
// pleine chez ce commerçant. C'est la faille déjà fermée dans `mes-cartes`.
//
// La restriction porte donc sur l'ÉTAT DU CLIENT, jamais sur le canal : le
// Click and Collect, le détail et le rendez-vous sont couverts pareil.

import { telephonesProuves } from '@/lib/yopper-telephones'
import { recompenseUtilisable } from '@/lib/fidelite-recompense'

const CHAMPS = 'id, carte_id, commercant_id, type, valeur, libelle, debloquee_at, utilisee_at'

/**
 * Crée les lignes de récompense au moment où la carte les débloque.
 *
 * 🔴 CE BRANCHEMENT N'AVAIT JAMAIS ÉTÉ FAIT, et Alex l'a trouvé au test F16.
 * La récompense existait à DEUX endroits :
 *   • le COMPTEUR `fidelite_cartes.recompenses_disponibles`, qu'`appliquerCredit`
 *     incrémente et que la fiche du commerce lit pour annoncer « ta récompense
 *     est débloquée » ;
 *   • la LIGNE `fidelite_recompenses`, que le tunnel de paiement interroge pour
 *     la proposer.
 * Le premier était alimenté, le second JAMAIS. Les seules lignes existantes
 * étaient celles du rattrapage unique de la migration : toute récompense
 * débloquée depuis était annoncée au client et introuvable au paiement.
 *
 * ⚠️ CE N'ÉTAIT PAS UN DÉFAUT DU DÉTAIL, malgré les apparences. Le Click and
 * Collect fonctionnait seulement parce que ces cartes-là avaient leur
 * récompense AVANT la migration. Tous les métiers étaient touchés.
 *
 * ⚠️ LA CONFIGURATION EST FIGÉE ICI, et c'est la règle du module depuis le
 * début : le montant est celui du jour où le client l'a gagnée. Un commerçant
 * qui baisse sa récompense de 10 € à 5 € ne doit pas reprendre ce qu'il a déjà
 * promis. C'est aussi ce que fait la migration, avec les mêmes replis.
 *
 * Best-effort assumé : appelée APRÈS que le crédit soit écrit, elle ne doit
 * jamais faire échouer un passage déjà acquis. Un échec ici laisse un compteur
 * sans ligne — exactement l'état qu'on répare — et se rattrape.
 */
export async function creerRecompensesDebloquees(supabase, { carte, commercant, nombre }) {
  const n = Number(nombre) || 0
  if (n <= 0 || !carte?.id || !commercant?.id) return 0

  // Mêmes replis que MIGRATION_FIDELITE_RECOMPENSES.sql, pour que les lignes
  // créées à chaud soient indiscernables de celles du rattrapage.
  const type = String(commercant.fidelite_recompense_type || '').trim() || 'remise_montant'
  const valeur = Number(commercant.fidelite_recompense_valeur) || 5
  const libelle = String(commercant.fidelite_recompense_libelle || '').trim() || 'Récompense fidélité'

  const lignes = Array.from({ length: n }, () => ({
    carte_id: carte.id,
    commercant_id: commercant.id,
    type,
    valeur,
    libelle,
    debloquee_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('fidelite_recompenses').insert(lignes)
  if (error) {
    console.error('[fidelite] récompenses non créées', error.message)
    return 0
  }
  return n
}

/**
 * La récompense que ce Yopper peut poser chez ce commerçant, ET combien il en a.
 *
 * ⚠️ LA PLUS ANCIENNE D'ABORD. Quelqu'un qui en a deux doit consommer celle
 * qu'il a gagnée en premier : c'est celle qui dormirait le plus longtemps, et
 * c'est la seule règle qu'on peut expliquer sans se justifier.
 *
 * ⚠️ ET ON REND LE TOTAL, depuis le 25/08. Une seule se dépense par commande,
 * c'est l'arbitrage d'Alex et c'est protecteur (voir `libelleAutresRecompenses`
 * dans `lib/fidelite-recompense.js`), mais le tunnel n'en disait rien : Alex a
 * vu deux récompenses en base et une seule à l'écran. Un choix qui ne se dit
 * pas se lit comme une perte.
 *
 * ⚠️ LE TOTAL NE SERT QU'À ÉCRIRE UNE PHRASE. Le montant déduit vient
 * toujours de LA récompense rendue ici, jamais du compte.
 *
 * @returns {Promise<{recompense: object|null, total: number}>}
 */
export async function recompensesDisponibles(supabase, { email, commercantId }) {
  const rien = { recompense: null, total: 0 }
  if (!email || !commercantId) return rien
  const tels = await telephonesProuves(supabase, email)
  if (tels.length === 0) return rien

  // ⚠️ ON PASSE PAR LES CARTES, PAS PAR LE TÉLÉPHONE DIRECTEMENT :
  // `fidelite_recompenses` ne porte pas de numéro, et c'est voulu — un numéro
  // de moins recopié est une donnée personnelle de moins à protéger.
  const { data: cartes } = await supabase
    .from('fidelite_cartes').select('id')
    .eq('commercant_id', commercantId)
    .in('telephone', tels)
  const ids = (cartes || []).map(c => c.id)
  if (ids.length === 0) return rien

  // ⚠️ LES DEUX CARTES D'UN MÊME YOPPER COMPTENT ENSEMBLE. La clé d'une carte
  // est un NUMÉRO DE GSM : qui a changé d'opérateur en a deux chez le même
  // commerçant. Ses récompenses sont les siennes, quel que soit le numéro qui
  // les a gagnées, et c'est déjà ce que fait le tri ci-dessous.
  // ⚠️ `count: 'exact'` PLUTÔT QUE COMPTER LES LIGNES RENDUES. Avec un
  // `.limit()`, compter ce qu'on reçoit plafonne silencieusement le total : un
  // Yopper qui en aurait plus que la limite en verrait moins qu'il n'en a, et
  // rien ne le signalerait. On ne ramène donc qu'une ligne, et la base compte.
  const { data, count } = await supabase
    .from('fidelite_recompenses').select(CHAMPS, { count: 'exact' })
    .in('carte_id', ids)
    .is('utilisee_at', null)
    .order('debloquee_at', { ascending: true })
    .limit(1)

  const premiere = (data || [])[0] || null
  return { recompense: premiere, total: premiere ? Number(count) || 1 : 0 }
}

/**
 * Charge UNE récompense désignée par le client, et refuse tout le reste.
 *
 * ⚠️ LE CLIENT ENVOIE UN IDENTIFIANT : il n'est jamais de confiance. Sans ce
 * contrôle, il suffirait de deviner l'identifiant d'une récompense pour poser
 * celle de quelqu'un d'autre sur sa propre commande. On revérifie donc TOUT :
 * qu'elle appartient bien à une carte d'un numéro PROUVÉ de cet email, qu'elle
 * est chez CE commerçant, et qu'elle n'est pas déjà dépensée.
 */
export async function chargerRecompensePourYopper(supabase, { email, commercantId, recompenseId }) {
  if (!recompenseId) return { ok: false, raison: 'absente' }
  if (!email) return { ok: false, raison: 'non_connecte' }

  const { data: recompense } = await supabase
    .from('fidelite_recompenses').select(CHAMPS)
    .eq('id', recompenseId)
    .maybeSingle()

  const etat = recompenseUtilisable(recompense, commercantId)
  if (!etat.ok) return { ok: false, raison: etat.raison }

  const tels = await telephonesProuves(supabase, email)
  if (tels.length === 0) return { ok: false, raison: 'pas_la_sienne' }

  const { data: carte } = await supabase
    .from('fidelite_cartes').select('id')
    .eq('id', recompense.carte_id)
    .in('telephone', tels)
    .maybeSingle()
  if (!carte) return { ok: false, raison: 'pas_la_sienne' }

  return { ok: true, recompense }
}

/**
 * Consomme une récompense. Rend `false` si elle l'était déjà.
 *
 * ⚠️ LE `WHERE utilisee_at IS NULL` EST TOUTE LA GARANTIE. Deux webhooks Stripe
 * rejoués en parallèle, ou une commande confirmée deux fois, ne peuvent pas la
 * dépenser deux fois : la seconde écriture ne trouve plus de ligne.
 *
 * ⚠️ ET LE COMPTEUR DE LA CARTE SUIT. `recompenses_disponibles` est lu par une
 * dizaine d'écrans ; le laisser en arrière ferait afficher une récompense qui
 * n'existe plus. Il ne descend jamais sous zéro, même si les deux vérités
 * avaient divergé avant aujourd'hui.
 */
export async function consommerRecompense(supabase, { recompense, source, commandeId = null, rdvId = null }) {
  if (!recompense?.id) return false

  const { data, error } = await supabase
    .from('fidelite_recompenses')
    .update({
      utilisee_at: new Date().toISOString(),
      utilisee_source: source,
      commande_id: commandeId,
      rdv_id: rdvId,
    })
    .eq('id', recompense.id)
    .is('utilisee_at', null)
    .select('id')
    .maybeSingle()

  if (error || !data) return false

  const { data: carte } = await supabase
    .from('fidelite_cartes').select('recompenses_disponibles')
    .eq('id', recompense.carte_id)
    .maybeSingle()
  const restant = Math.max(0, Number(carte?.recompenses_disponibles || 0) - 1)
  await supabase.from('fidelite_cartes')
    .update({ recompenses_disponibles: restant, updated_at: new Date().toISOString() })
    .eq('id', recompense.carte_id)

  // ⚠️ CE MOUVEMENT NE PORTE PAS LA COMMANDE, ET C'EST VOLONTAIRE.
  //
  // `fidelite_mouvements` a un index UNIQUE sur (carte_id, commande_id), et cet
  // index est ce qui rend le crédit automatique idempotent : une commande ne
  // crédite jamais deux fois la même carte. Y inscrire aussi la consommation
  // aurait occupé la place. Au retrait de la commande, le crédit du passage
  // serait tombé en doublon et aurait été pris pour un rejeu déjà traité :
  // **utiliser sa récompense aurait silencieusement coûté le passage de cette
  // commande-là**, c'est-à-dire exactement l'inverse de ce qu'on construit.
  //
  // Le lien n'est pas perdu pour autant : `fidelite_recompenses` porte déjà
  // `commande_id` et `rdv_id`, qui viennent d'être écrits juste au-dessus.
  await supabase.from('fidelite_mouvements').insert({
    carte_id: recompense.carte_id,
    type: 'recompense_utilisee',
    source,
  })

  return true
}

/**
 * Rend une récompense prise à tort. L'exact inverse de `consommerRecompense`.
 *
 * ⚠️ CE N'EST PAS UN CONFORT, C'EST LA CONTREPARTIE D'UNE PRISE ANTICIPÉE.
 * Une commande consomme la récompense AVANT de débiter le bon cadeau, parce
 * qu'un bon débité ne se rend pas facilement alors qu'une récompense, si. Le
 * jour où le bon est refusé, la commande n'a pas lieu : sans cette fonction,
 * le Yopper perdrait une carte entière à cause d'un bon qui ne le concerne
 * même pas.
 *
 * ⚠️ ET ON LAISSE LA TRACE. Le mouvement d'annulation n'efface pas celui de la
 * prise : deux lignes qui se répondent racontent ce qui s'est passé, une ligne
 * effacée laisse un journal qui ment.
 */
export async function rendreRecompense(supabase, recompense) {
  if (!recompense?.id) return false

  const { data } = await supabase
    .from('fidelite_recompenses')
    .update({ utilisee_at: null, utilisee_source: null, commande_id: null, rdv_id: null })
    .eq('id', recompense.id)
    // ⚠️ On ne rend QUE ce qui est effectivement pris. Sans ce filtre, un appel
    // en double rendrait une récompense déjà rendue, et le compteur de la carte
    // monterait d'un cran à chaque passage.
    .not('utilisee_at', 'is', null)
    .select('id')
    .maybeSingle()

  if (!data) return false

  const { data: carte } = await supabase
    .from('fidelite_cartes').select('recompenses_disponibles')
    .eq('id', recompense.carte_id)
    .maybeSingle()
  await supabase.from('fidelite_cartes')
    .update({
      recompenses_disponibles: Number(carte?.recompenses_disponibles || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recompense.carte_id)

  // ⚠️ `type` ET `source` SONT CONTRAINTS EN BASE, on ne choisit pas ses mots.
  // `type` vaut l'un de : passage, cagnotte, recompense_debloquee,
  // recompense_utilisee, ajustement. `source` : comptoir, commande, rdv,
  // system. Un « recompense_rendue » aurait été REJETÉ par la contrainte, et
  // comme l'erreur n'est pas lue ici, le journal aurait perdu la ligne sans
  // que rien ne le signale.
  await supabase.from('fidelite_mouvements').insert({
    carte_id: recompense.carte_id,
    type: 'ajustement',
    source: 'system',
  })

  return true
}
