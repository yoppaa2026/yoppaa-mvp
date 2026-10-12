// BANC — LE STOCK RÉEL DES LOTS ET LES OPTIONS OBLIGATOIRES (11/10)
//
// Deux défauts trouvés à l'audit des articles au poids, déjà en prod :
//   1. un lot « 3+1 » enregistrait `quantite` = 1 : après les 5 minutes de la
//      réservation, le stock ne baissait que d'une unité ; le second article
//      d'un duo, jamais ;
//   2. AUCUN serveur ne vérifiait les options obligatoires, et la fiche
//      détaillée ajoutait l'article sans les demander.
// Décision d'Alex (tableau, 11/10) : chantier à part, avant le poids.
//
// ⚠️ LE BANC EXÉCUTE LA RÈGLE (construireLignesCommande) ET LIT LE CODE QUI
// L'APPELLE : une règle juste qu'aucune route ne branche ne protège rien.
//
//   npm run verif:lots-options

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { construireLignesCommande, SELECT_OPTIONS_VALEURS, SELECT_GROUPES_OPTIONS } from '../lib/lignes-commande.js'

const RACINE = new URL('../', import.meta.url)
const lire = (f) => readFileSync(new URL(f, RACINE), 'utf8')
const code = (f) => sansProse(lire(f))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA RÈGLE, EXÉCUTÉE
// ═══════════════════════════════════════════════════════════════════════════
const JOUR = '2026-10-12'
const commercant = { id: 'c1', tva_taux_defaut: 6 }
const pizza = { id: 'p1', nom: 'Margherita', prix: 10, categorie: 'Pizzas', actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 5 }
const croissant = { id: 'k1', nom: 'Croissant', prix: 1.2, categorie: 'Viennoiseries', actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 1 }
const cafe = { id: 'f1', nom: 'Café', prix: 2, categorie: 'Boissons', actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 1 }
const articlesData = [pizza, croissant, cafe]
const groupes = [
  { id: 'gBase', article_id: 'p1', nom: 'Base', obligatoire: true },
  { id: 'gSupp', article_id: 'p1', nom: 'Suppléments', obligatoire: false },
  { id: 'gAutre', article_id: 'k1', nom: 'Garniture', obligatoire: true },
]
const valeur = (id, groupe_id, nom, prix_supplement = 0) => {
  const g = groupes.find(x => x.id === groupe_id)
  return { id, nom, prix_supplement, groupe_id, article_options_groupes: { article_id: g.article_id, nom: g.nom } }
}
const optionsValeurs = [
  valeur('vTomate', 'gBase', 'Tomate'),
  valeur('vOlive', 'gSupp', 'Olives', 1),
  valeur('vBeurre', 'gAutre', 'Beurre'),
]
const lot = { id: 'dLot', deal_type: 'lot', titre: '3 + 1 croissants', prix_deal: 3.6, unites_par_deal: 4, article_id: 'k1', date_deal: JOUR, actif: true }
const duo = { id: 'dDuo', deal_type: 'bundle', titre: 'Croissant + café', prix_deal: 2.8, article_id: 'k1', article2_id: 'f1', date_deal: JOUR, actif: true }
const calc = (panier, extra = {}) => construireLignesCommande({
  panier, articlesData, optionsValeurs, variantesData: [], dealsData: [lot, duo],
  commercant, regime: 'emporter', dateCommande: JOUR, groupesOptions: groupes, ...extra,
})

// ─── Le stock réel des lots ────────────────────────────────────────────────
{
  const r = calc([{ id: 'k1', quantite: 2, deal_id: 'dLot' }])
  v('🔴 deux lots de 4 : la ligne retire 8 unités (quantite_stock), elle en compte 2 (quantite)',
    r.ok && r.lignes[0].quantite === 2 && r.lignes[0].quantite_stock === 8, JSON.stringify(r.lignes?.[0]))
  const d = calc([{ id: 'k1', quantite: 3, deal_id: 'dDuo' }])
  v('🔴 trois duos : le second article est porté par la ligne (il en retire 3)',
    d.ok && d.lignes[0].deal_article2_id === 'f1' && d.lignes[0].quantite === 3 && d.lignes[0].quantite_stock === 3, JSON.stringify(d.lignes?.[0]))
  const u = calc([{ id: 'k1', quantite: 5, options: [{ valeur_ids: ['vBeurre'] }] }])
  v('une unité simple : quantite_stock = quantite, aucun second article',
    u.ok && u.lignes[0].quantite_stock === 5 && u.lignes[0].deal_article2_id === null, JSON.stringify(u))
}

// ─── Les options obligatoires ──────────────────────────────────────────────
{
  const sans = calc([{ id: 'p1', quantite: 1 }])
  v('🔴 une pizza sans sa base obligatoire est REFUSÉE, avec le nom du choix et de l’article',
    !sans.ok && sans.error === 'Choisis « Base » pour « Margherita ».' && sans.option_manquante === true, JSON.stringify(sans))
  const optionnelSeul = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vOlive'] }] }])
  v('🔴 un choix FACULTATIF ne remplace pas l’obligatoire', !optionnelSeul.ok, JSON.stringify(optionnelSeul))
  const autreArticle = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vBeurre'] }] }])
  v('🔴 la valeur d’un AUTRE article ne compte pas', !autreArticle.ok, JSON.stringify(autreArticle))
  const avec = calc([{ id: 'p1', quantite: 2, options: [{ valeur_ids: ['vTomate', 'vOlive'] }] }])
  v('avec sa base : acceptée, supplément compté (10 + 1) × 2 = 22 €',
    avec.ok && avec.totalCents === 2200, JSON.stringify(avec))
  const baseSeule = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vTomate'] }] }])
  v('🔴 la base seule suffit : un groupe FACULTATIF n’est jamais exigé', baseSeule.ok && baseSeule.totalCents === 1000, JSON.stringify(baseSeule))
  const offre = calc([{ id: 'k1', quantite: 1, deal_id: 'dLot' }])
  v('🔴 une OFFRE (lot, duo, invendu) passe sans options : le commerçant la publie composée', offre.ok, JSON.stringify(offre))
  const sansGroupes = calc([{ id: 'p1', quantite: 1 }], { groupesOptions: null })
  v('sans liste de groupes (calcul du total à l’écran) : aucun contrôle', sansGroupes.ok)
}
v('les deux listes de colonnes : valeurs avec leur groupe, groupes avec « obligatoire »',
  SELECT_OPTIONS_VALEURS === 'id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)'
  && SELECT_GROUPES_OPTIONS === 'id, article_id, nom, obligatoire')

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES ROUTES L'APPELLENT ET ENREGISTRENT LA CONSOMMATION
// ═══════════════════════════════════════════════════════════════════════════
const ROUTES = {
  'en ligne': 'app/api/stripe/checkout/create-commande/route.js',
  'rendez-vous': 'app/api/stripe/checkout/create-rdv-commande/route.js',
  'encodée': 'app/api/equipe/commande/creer/route.js',
}
for (const [nom, f] of Object.entries(ROUTES)) {
  const c = code(f)
  const client = nom === 'encodée' ? 'admin' : 'supabase'
  v(`🔴 route ${nom} : les options des SEULS articles du panier (plus de lecture de toute la plateforme)`,
    c.includes(`${client}.from('article_options_valeurs').select(SELECT_OPTIONS_VALEURS).in('article_options_groupes.article_id', articleIds)`)
    && !c.includes("from('article_options_valeurs').select('id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)')"))
  v(`🔴 route ${nom} : elle lit les groupes et les passe à la règle`,
    c.includes(`${client}.from('article_options_groupes').select(SELECT_GROUPES_OPTIONS).in('article_id', articleIds)`)
    && c.includes('groupesOptions: groupesOptions || [],'))
  v(`🔴 route ${nom} : une lecture d’options en échec REFUSE (jamais « aucune option »)`,
    nom === 'encodée'
      ? /if \(eA \|\| eO \|\| eV \|\| eD \|\| eG\) return non\(/.test(c)
      : /if \(errOptions \|\| errGroupes\) \{[^}]*\}, \{ status: 500 \}\)\s*\}/.test(c))
  v(`🔴 route ${nom} : la ligne enregistre ce qu’elle retire vraiment du stock`,
    c.includes('quantite_stock: l.quantite_stock,') && c.includes('duo_article_id: l.deal_article2_id || null,'))
  // (12/10) La route des rendez-vous jetait le nom, la version et l'offre.
  v(`🔴 route ${nom} : la ligne fige le nom vendu`, c.includes('article_nom: l.article_nom,'))
  if (nom !== 'encodée') {
    v(`🔴 route ${nom} : la ligne garde sa version et son offre`,
      c.includes('variante_id: l.variante_id || null,') && c.includes('deal_id: l.deal_id || null,'))
    v(`🔴 route ${nom} : le plafond des offres est vérifié AVANT de créer la commande`,
      /const verifOffres = await verifierQuantiteOffres\(\{[\s\S]*?\}\)\s*if \(!verifOffres\.ok\)/.test(c)
      && c.search(/\.from\('commandes'\)\s*\.insert\(/) > c.indexOf('await verifierQuantiteOffres({')
      && c.indexOf('await verifierQuantiteOffres({') > 0)
  }
}
v('🔴 le tableau de bord compte le « déjà commandé » par la même vue que le serveur',
  /\.from\('consommation_stock'\)\s*\.select\('article_id, quantite, commande_id'\)/.test(code('app/dashboard/ConfigDashboard.js')))

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES ÉCRANS NE CONTOURNENT PLUS LE CHOIX
// ═══════════════════════════════════════════════════════════════════════════
{
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 fiche détaillée : un article à options passe par le choix (OptionsSelector), plus par « Ajouter » direct',
    /\(!hasVar && onAjouter && !article\.est_vitrine && groupes\.length > 0\) \? \(\s*<OptionsSelector article=\{article\} groupes=\{groupes\}\s*onAjouter=\{\(a, opts\) => \{ onAjouter\(a, opts\); onClose\(\) \}\}\/>/.test(fiche)
    && fiche.includes('groupes={optionsParArticle[articleDetail.id] || []}')
    && fiche.includes('onAjouter={peutCommander ? (a, opts = null) => ajouterAuPanier(a, opts) : null}'))
  v('le titre du choix ne présume pas du genre de l’article (« Ta personnalisation : … », choisi par Alex ; jamais « Personnalise ton »)',
    fiche.includes('>Ta personnalisation : {article.nom}</p>') && !/Personnalise (ton|ta) \{article\.nom\}/.test(fiche))
  v('🔴 panier venu du rendez-vous : un article à choix obligatoire reste derrière, et le client est prévenu',
    fiche.includes('if ((optionsParArticle[article.id] || []).some(g => g.obligatoire)) { ignores.push(article.nom); continue }')
    && fiche.includes('setPanierRepris({ repris, ignores })'))

  const rdv = code('app/commander/rdv/[slug]/page.js')
  v('🔴 tunnel rendez-vous : les choix obligatoires sont lus, et une lecture en échec ferme l’achat de tout',
    rdv.includes(".from('article_options_groupes').select('article_id').eq('obligatoire', true).in('article_id', ids)")
    && rdv.includes('obligatoires = errGrp ? new Set(ids) : new Set((grp || []).map(g => g.article_id))'))
  v('🔴 tunnel rendez-vous : pas d’achat d’un article à choix obligatoire (tuile, ajout, reprise)',
    rdv.includes('const achetable = produitsAchetables && !p.est_vitrine && Number(p.prix) > 0 && !p.choix_obligatoire')
    && rdv.includes('if (article?.choix_obligatoire) return')
    && rdv.includes('|| article.choix_obligatoire) continue')
    && rdv.includes('À composer en boutique'))
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LA MIGRATION
// ═══════════════════════════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_LOTS_STOCK_REEL.sql')
  v('🔴 migration : les deux colonnes, la vue qui ajoute le second article du duo',
    sql.includes('ADD COLUMN IF NOT EXISTS quantite_stock integer')
    // 🔴 SANS CLÉ ÉTRANGÈRE (11/10) : un second lien vers `articles` rendait
    // ambiguë toute lecture `article:articles(…)` depuis les lignes, et
    // l'essai entier refusait ses commandes (vu par Alex).
    && /ADD COLUMN IF NOT EXISTS duo_article_id uuid;/.test(sql)
    && !/duo_article_id uuid REFERENCES/.test(sql)
    && sql.includes('DROP CONSTRAINT IF EXISTS commande_articles_duo_article_id_fkey;')
    && sql.includes("'1'\n) t ORDER BY n;".replace('\n', sql.includes('\r\n') ? '\r\n' : '\n'))
    && /SELECT ca\.commande_id, ca\.article_id, COALESCE\(ca\.quantite_stock, ca\.quantite\) AS quantite\s+FROM public\.commande_articles ca\s+UNION ALL\s+SELECT ca\.commande_id, ca\.duo_article_id AS article_id, ca\.quantite\s+FROM public\.commande_articles ca\s+WHERE ca\.duo_article_id IS NOT NULL;/.test(sql))
  v('🔴 migration : la vue applique la RLS (security_invoker) et reste fermée aux visiteurs',
    sql.includes('CREATE OR REPLACE VIEW public.consommation_stock WITH (security_invoker = true) AS')
    && sql.includes('REVOKE ALL ON public.consommation_stock FROM PUBLIC, anon, authenticated;')
    && sql.includes('GRANT SELECT ON public.consommation_stock TO authenticated, service_role;'))
  v('🔴 migration : les fonctions sont RELUES EN BASE, avec le nombre exact de lectures attendu, sinon rien ne change',
    sql.includes('avant := pg_get_functiondef(r.oid);')
    && sql.includes("CASE p.proname WHEN 'reserver_stock_atomique' THEN 3 ELSE 1 END AS attendu")
    && /IF n <> r\.attendu THEN\s+RAISE EXCEPTION/.test(sql)
    && sql.includes("apres := replace(avant, motif, 'FROM public.consommation_stock ca');"))
  // Vise le BLOC qui réécrit, pas une ligne : ajouter la fonction à la liste
  // gardait le début de la ligne intact (mutation restée verte, 11/10).
  const reecriture = sql.slice(sql.indexOf('DO $$'), sql.indexOf('END $$;'))
  v('🔴 migration : `vendu_par_offre` n’est PAS touchée (le plafond d’une offre compte des lots)',
    reecriture.length > 0 && !reecriture.includes('vendu_par_offre')
    && /AND p\.proname IN \('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin'\)\r?\n/.test(reecriture)
    && sql.includes("'30f9a6390691143e65b54ac84c8c5491'"))
}

// ═══ 5. LE LIEN NOMMÉ (12/10) ════════════════════════════════════════════════
// 🔴 « Could not embed because more than one relationship was found for
// 'commande_articles' and 'articles' » : le tableau de bord de Chez Momo
// n'affichait plus aucune commande (Alex, 12/10). Un second chemin entre les
// lignes et les articles rend AMBIGUË toute lecture `article:articles(…)`
// depuis les lignes, et Supabase refuse la requête ENTIÈRE. Le lien est donc
// TOUJOURS nommé : un chemin ajouté demain ne cassera plus rien.
{
  const { readdirSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const tous = []
  const parcourir = (d) => {
    for (const n of readdirSync(new URL(d, RACINE))) {
      const rel = join(d, n).replace(/\\/g, '/')
      if (statSync(new URL(rel, RACINE)).isDirectory()) { if (n !== 'node_modules') parcourir(rel + '/') }
      else if (/\.(js|jsx|ts|tsx)$/.test(n)) tous.push(rel)
    }
  }
  parcourir('app/'); parcourir('lib/')
  const nus = tous.filter(f => /article:articles\(/.test(code(f)))
  v('🔴 aucune lecture `article:articles(…)` sans le lien nommé (`!commande_articles_article_id_fkey`)', nus.length === 0, nus.join(', '))
  v('le tableau de bord nomme le lien dans ses deux lectures de commandes',
    (code('app/dashboard/page.js').match(/article:articles!commande_articles_article_id_fkey\(/g) || []).length === 2)
}

console.log(`\nLots et options : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
