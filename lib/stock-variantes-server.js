// Rendre le stock des versions quand une commande n'aboutit pas.
//
// ⚠️ LE DÉFAUT QUE CE FICHIER RÈGLE, ET IL VIDAIT LES RAYONS TOUT SEUL.
//
// Yoppaa gère le stock de DEUX façons différentes selon le module.
//
//   • En ALIMENTAIRE, une réservation à durée de vie : on ne touche pas au
//     stock, on pose une note « retenu 5 minutes » à côté. Le client paie, la
//     note devient une commande ; il abandonne, la note expire toute seule.
//     Rien ne peut être oublié parce qu'il n'y a rien à se rappeler.
//
//   • En BOUTIQUE DE DÉTAIL, un décrément en dur : `article_variantes.stock`
//     perd une unité dès la création de la commande, AVANT le paiement. Si la
//     commande n'aboutit pas, il faut que quelqu'un pense à la rendre.
//
// Personne n'y pensait. Les trois sorties étaient ouvertes : abandon du
// paiement Stripe, expiration de la commande par le cron, annulation par le
// client. À chaque abandon de panier, et c'est le cas le plus courant du
// commerce en ligne, une pièce disparaissait des rayons de Yoppaa sans quitter
// l'étagère du magasin. Le commerçant finissait par afficher « épuisé » sur un
// article dont il avait trois exemplaires, et perdait toutes les ventes
// suivantes sans jamais comprendre pourquoi.
//
// ⚠️ L'IDEMPOTENCE NE VIENT PAS D'ICI. Cette fonction rend ce qu'on lui demande,
// sans se demander si ça a déjà été fait. C'est à l'APPELANT de ne l'appeler que
// sur une transition RÉELLE : un `update(...).eq('statut', <ancien statut>)`
// qui ne rend une ligne que s'il a effectivement changé quelque chose. Un
// webhook rejoué deux fois ne change rien la seconde fois, donc ne rend rien.
// Sans cette précaution, le stock remonterait à chaque tentative.

// Rend au stock ce que ces commandes avaient consommé.
//
// @param commandeIds  identifiants des commandes qui viennent d'être annulées
// @returns { ok, rendues, error? }  `rendues` = nombre de versions recréditées
export async function restaurerStockVariantes(supabase, commandeIds) {
  const ids = (Array.isArray(commandeIds) ? commandeIds : [commandeIds]).filter(Boolean)
  if (ids.length === 0) return { ok: true, rendues: 0 }

  const { data: lignes, error } = await supabase
    .from('commande_articles')
    .select('variante_id, quantite')
    .in('commande_id', ids)
    .not('variante_id', 'is', null)

  if (error) return { ok: false, rendues: 0, error: error.message }
  if (!lignes || lignes.length === 0) return { ok: true, rendues: 0 }

  // Une même version peut apparaître sur plusieurs lignes, et plusieurs
  // commandes peuvent être annulées d'un coup : on additionne AVANT d'écrire,
  // sinon deux écritures concurrentes sur la même version en perdraient une.
  const aRendre = new Map()
  for (const l of lignes) {
    const q = Number(l.quantite) || 0
    if (q <= 0) continue
    aRendre.set(l.variante_id, (aRendre.get(l.variante_id) || 0) + q)
  }
  if (aRendre.size === 0) return { ok: true, rendues: 0 }

  const { data: versions, error: errLect } = await supabase
    .from('article_variantes')
    .select('id, stock')
    .in('id', [...aRendre.keys()])
  if (errLect) return { ok: false, rendues: 0, error: errLect.message }

  let rendues = 0
  for (const v of (versions || [])) {
    const nouveau = (Number(v.stock) || 0) + aRendre.get(v.id)
    const { error: errMaj } = await supabase
      .from('article_variantes')
      .update({ stock: nouveau })
      .eq('id', v.id)
    // Non bloquant : rendre neuf versions sur dix vaut mieux que zéro. Ce qui
    // reste apparaît dans les journaux, et le commerçant peut corriger à la main.
    if (errMaj) console.error('[stock-variantes] restitution KO', { variante: v.id, erreur: errMaj.message })
    else rendues++
  }

  return { ok: true, rendues }
}
