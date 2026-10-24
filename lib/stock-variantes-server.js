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

import { variantesSansLimite, joursFournisseurVariante } from './stock-article.js'

// ✅ (22/10, audit R3) LES VERSIONS « FABRIQUÉES À LA DEMANDE » NE SE COMPTENT
// PAS : rien n'est prélevé à la vente, donc rien n'est rendu ni repris. Sans
// cela, chaque annulation gonflerait un chiffre que personne ne lit, et il
// ressortirait faux le jour où la boutique repasse en stock par variante.
// Rend l'ensemble des versions (identifiants) dont l'article ne compte pas.
async function versionsSansLimite(supabase, versions) {
  const articleIds = [...new Set((versions || []).map(v => v.article_id).filter(Boolean))]
  if (articleIds.length === 0) return { ok: true, ids: new Set() }
  const { data, error } = await supabase.from('articles').select('id, gere_variantes, stock_mode').in('id', articleIds)
  if (error) return { ok: false, ids: new Set(), error: error.message }
  const libres = new Set((data || []).filter(variantesSansLimite).map(a => a.id))
  return { ok: true, ids: new Set((versions || []).filter(v => libres.has(v.article_id)).map(v => v.id)) }
}

// Rend au stock ce que ces commandes avaient consommé.
//
// ✅ (24/10, Caprice) LA PART FOURNISSEUR NE REVIENT PAS (décision d'Alex) :
// ces pièces n'ont jamais été dans le rayon, les rendre gonflerait le stock
// d'une taille que la boutique n'a pas. SAUF « pas venu la chercher »
// (`avecFournisseur: true`) : la pièce est arrivée, elle est en magasin.
//
// @param commandeIds  identifiants des commandes qui viennent d'être annulées
// @param options.avecFournisseur  rendre aussi les pièces venues du fournisseur
// @returns { ok, rendues, error? }  `rendues` = nombre de versions recréditées
export async function restaurerStockVariantes(supabase, commandeIds, { avecFournisseur = false } = {}) {
  const ids = (Array.isArray(commandeIds) ? commandeIds : [commandeIds]).filter(Boolean)
  if (ids.length === 0) return { ok: true, rendues: 0 }

  const { data: lignes, error } = await supabase
    .from('commande_articles')
    .select('variante_id, quantite, quantite_fournisseur')
    .in('commande_id', ids)
    .not('variante_id', 'is', null)

  if (error) return { ok: false, rendues: 0, error: error.message }
  if (!lignes || lignes.length === 0) return { ok: true, rendues: 0 }

  // Une même version peut apparaître sur plusieurs lignes, et plusieurs
  // commandes peuvent être annulées d'un coup : on additionne AVANT d'écrire,
  // sinon deux écritures concurrentes sur la même version en perdraient une.
  const aRendre = new Map()
  for (const l of lignes) {
    const q = (Number(l.quantite) || 0) - (avecFournisseur ? 0 : Math.max(0, Number(l.quantite_fournisseur) || 0))
    if (q <= 0) continue
    aRendre.set(l.variante_id, (aRendre.get(l.variante_id) || 0) + q)
  }
  if (aRendre.size === 0) return { ok: true, rendues: 0 }

  const { data: versions, error: errLect } = await supabase
    .from('article_variantes')
    .select('id, stock, article_id')
    .in('id', [...aRendre.keys()])
  if (errLect) return { ok: false, rendues: 0, error: errLect.message }
  const libres = await versionsSansLimite(supabase, versions)
  if (!libres.ok) return { ok: false, rendues: 0, error: libres.error }

  let rendues = 0
  for (const v of (versions || [])) {
    if (libres.ids.has(v.id)) continue
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

// Le geste INVERSE : une commande déclarée « non retirée » par erreur revient
// « prête ». Son stock avait été rendu ; il faut le reprendre, sinon la pièce
// existe deux fois, une sur l'étagère du client et une dans les rayons en
// ligne, et la suivante sera vendue sans exister.
//
// ⚠️ MÊME RÈGLE D'APPEL QUE `restaurerStockVariantes` : seulement sur une
// transition RÉELLE (`.eq('statut', 'non_retire')` qui a rendu une ligne).
//
// ✅ (24/10) LA PART FOURNISSEUR EST REPRISE AUSSI : « pas venu la chercher »
// l'avait rendue au stock (`avecFournisseur: true`), le geste inverse la
// reprend en entier.
//
// ⚠️ JAMAIS EN DESSOUS DE ZÉRO. Si la pièce rendue a été revendue entre-temps,
// le stock en ligne ne peut pas devenir négatif : on le pose à zéro, et on
// compte ce qui manque pour le dire au commerçant.
//
// @returns { ok, reprises, manquantes, error? }
export async function reprendreStockVariantes(supabase, commandeIds) {
  const ids = (Array.isArray(commandeIds) ? commandeIds : [commandeIds]).filter(Boolean)
  if (ids.length === 0) return { ok: true, reprises: 0, manquantes: 0 }

  const { data: lignes, error } = await supabase
    .from('commande_articles')
    .select('variante_id, quantite')
    .in('commande_id', ids)
    .not('variante_id', 'is', null)
  if (error) return { ok: false, reprises: 0, manquantes: 0, error: error.message }
  if (!lignes || lignes.length === 0) return { ok: true, reprises: 0, manquantes: 0 }

  const aReprendre = new Map()
  for (const l of lignes) {
    const q = Number(l.quantite) || 0
    if (q <= 0) continue
    aReprendre.set(l.variante_id, (aReprendre.get(l.variante_id) || 0) + q)
  }
  if (aReprendre.size === 0) return { ok: true, reprises: 0, manquantes: 0 }

  const { data: versions, error: errLect } = await supabase
    .from('article_variantes')
    .select('id, stock, article_id')
    .in('id', [...aReprendre.keys()])
  if (errLect) return { ok: false, reprises: 0, manquantes: 0, error: errLect.message }
  const libres = await versionsSansLimite(supabase, versions)
  if (!libres.ok) return { ok: false, reprises: 0, manquantes: 0, error: libres.error }

  let reprises = 0, manquantes = 0
  for (const v of (versions || [])) {
    if (libres.ids.has(v.id)) continue
    const avant = Number(v.stock) || 0
    const voulu = aReprendre.get(v.id)
    const nouveau = Math.max(0, avant - voulu)
    manquantes += Math.max(0, voulu - avant)
    const { error: errMaj } = await supabase
      .from('article_variantes')
      .update({ stock: nouveau })
      .eq('id', v.id)
    if (errMaj) console.error('[stock-variantes] reprise KO', { variante: v.id, erreur: errMaj.message })
    else reprises++
  }

  return { ok: true, reprises, manquantes }
}

// Prélève au stock des versions ce qu'une commande vient de prendre (10/10).
//
// ⚠️ À PARTIR DES LIGNES CALCULÉES PAR LE SERVEUR, jamais du panier envoyé par
// le navigateur : avant, `create-commande` relisait le corps de la requête,
// donc une quantité que le calcul avait refusée ou corrigée pouvait quand même
// sortir du rayon. Une même version sur deux lignes est additionnée AVANT
// d'écrire, comme à la restitution.
//
// Partagé par la commande en ligne et la commande encodée par le commerçant.
// Non bloquant, comme avant : la commande existe, une version mal décomptée se
// corrige à la main ; mais chaque échec se dit.
//
// @returns { ok, prelevees, echecs }
// ✅ (22/10, audit R3) `articlesData` : une version d'un article « fabriqué à
// la demande » ne se prélève pas.
//
// ✅ (24/10, Caprice) LE RETRAIT SE FAIT SOUS VERROU, EN BASE
// (`prelever_stock_variante`, MIGRATION_SUR_COMMANDE_FOURNISSEUR_24_10) : il
// partait de l'instantané lu plus tôt, si bien que deux clients sur la
// dernière pièce la prenaient tous les deux. La fonction rend ce qui MANQUAIT
// vraiment au stock. Pour un article qui se recommande chez le fournisseur,
// un manque plus grand que prévu (l'autre client est passé une seconde
// avant) est reporté sur la ligne : le commerçant voit juste ce qu'il doit
// commander, et l'annulation ne rend pas une pièce qui n'a jamais été là.
//
// @param options.commandeId  la commande dont les lignes viennent d'être
//        insérées : sans elle, le manque n'est que journalisé.
// @returns { ok, prelevees, echecs, reportees }
export async function preleverStockVariantes(supabase, lignes, variantesData, articlesData = [], { commandeId = null } = {}) {
  const versionParId = Object.fromEntries((variantesData || []).map(v => [v.id, v]))
  const articleParId = Object.fromEntries((articlesData || []).map(a => [a.id, a]))
  const aPrelever = new Map()
  // Par version : la part fournisseur déjà portée par les lignes, et l'article.
  const prevu = new Map()
  const articleDeVersion = new Map()
  for (const l of lignes || []) {
    if (!l.variante_id) continue
    if (variantesSansLimite(articleParId[l.article_id])) continue
    const q = Number(l.quantite) || 0
    if (q <= 0) continue
    aPrelever.set(l.variante_id, (aPrelever.get(l.variante_id) || 0) + q)
    prevu.set(l.variante_id, (prevu.get(l.variante_id) || 0) + Math.max(0, Number(l.quantite_fournisseur) || 0))
    articleDeVersion.set(l.variante_id, articleParId[l.article_id])
  }
  let prelevees = 0, reportees = 0
  const echecs = []
  for (const [id, q] of aPrelever) {
    const v = versionParId[id]
    if (!v) { echecs.push(id); continue }
    const { data: manque, error } = await supabase.rpc('prelever_stock_variante', { p_variante_id: id, p_quantite: q })
    // La version a disparu entre-temps : rien à retirer, et ça se dit.
    if (!error && (manque === null || manque === undefined)) { echecs.push(id); continue }
    if (error) {
      // ⚠️ La fonction absente ou en erreur ne laisse pas le rayon plein : on
      // retombe sur l'écriture d'avant, depuis l'instantané.
      console.error('[stock-variantes] prélèvement sous verrou KO, repli', { id, msg: error.message })
      const { error: errRepli } = await supabase
        .from('article_variantes')
        .update({ stock: Math.max(0, (v.stock || 0) - q) })
        .eq('id', id)
      if (errRepli) { echecs.push(id); console.error('[stock-variantes] prélèvement KO (non bloquant)', { id, msg: errRepli.message }) }
      else prelevees++
      continue
    }
    prelevees++
    const enTrop = Math.max(0, Number(manque) - (prevu.get(id) || 0))
    if (enTrop === 0) continue
    if (!commandeId || joursFournisseurVariante(articleDeVersion.get(id), v) === null) {
      console.error('[stock-variantes] pièce vendue sans stock (non bloquant)', { id, manque, prevu: prevu.get(id) || 0 })
      continue
    }
    reportees += await reporterPartFournisseur(supabase, commandeId, id, enTrop)
  }
  return { ok: echecs.length === 0, prelevees, echecs, reportees }
}

// Ajoute `enTrop` pièces à la part fournisseur des lignes de cette version,
// sans jamais dépasser la quantité d'une ligne. Rend le nombre de pièces reportées.
async function reporterPartFournisseur(supabase, commandeId, varianteId, enTrop) {
  const { data: lignes, error } = await supabase
    .from('commande_articles')
    .select('id, quantite, quantite_fournisseur')
    .eq('commande_id', commandeId)
    .eq('variante_id', varianteId)
  if (error || !lignes) {
    console.error('[stock-variantes] report fournisseur KO (lecture)', { varianteId, msg: error?.message })
    return 0
  }
  let reste = enTrop, reportees = 0
  for (const l of lignes) {
    if (reste <= 0) break
    const deja = Math.max(0, Number(l.quantite_fournisseur) || 0)
    const place = Math.max(0, (Number(l.quantite) || 0) - deja)
    const ajout = Math.min(place, reste)
    if (ajout <= 0) continue
    const { error: errMaj } = await supabase
      .from('commande_articles')
      .update({ quantite_fournisseur: deja + ajout })
      .eq('id', l.id)
    if (errMaj) { console.error('[stock-variantes] report fournisseur KO', { ligne: l.id, msg: errMaj.message }); continue }
    reste -= ajout
    reportees += ajout
  }
  return reportees
}
