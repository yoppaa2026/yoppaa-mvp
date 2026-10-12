// HARNAIS DE MUTATION — LE STOCK RÉEL DES LOTS ET LES OPTIONS OBLIGATOIRES (11/10)
//
// Chaque mutation casse UNE partie du correctif ; `verif:lots-options` doit
// rougir. Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-lots-options.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:lots-options'
const REGLE = 'lib/lignes-commande.js'
const EN_LIGNE = 'app/api/stripe/checkout/create-commande/route.js'
const RDV = 'app/api/stripe/checkout/create-rdv-commande/route.js'
const ENCODEE = 'app/api/equipe/commande/creer/route.js'
const FICHE = 'app/commander/[slug]/page.js'
const TUNNEL = 'app/commander/rdv/[slug]/page.js'
const SQL = 'migrations/MIGRATION_LOTS_STOCK_REEL.sql'

const MUTATIONS = [
  // ─── la règle ───────────────────────────────────────────────────────────
  { nom: '🔴 une option obligatoire manquante passe', fichier: REGLE,
    de: '      if (manquant) return echec(', vers: '      if (false) return echec(' },
  { nom: '🔴 une valeur facultative suffit à l obligatoire', fichier: REGLE,
    de: '    if (g?.obligatoire) (obligatoiresParArticle[g.article_id] ||= []).push(g)', vers: '    if (g) (obligatoiresParArticle[g.article_id] ||= []).push(g)' },
  { nom: '🔴 le choix d un autre groupe compte', fichier: REGLE,
    de: "      const manquant = (obligatoiresParArticle[article.id] || []).find(g => !groupesChoisis.has(g.id))", vers: "      const manquant = (obligatoiresParArticle[article.id] || []).find(g => groupesChoisis.size === 0)" },
  { nom: '🔴 une offre (lot) exige aussi les options : les invendus deviennent invendables', fichier: REGLE,
    de: '    if (!deal && !variante) {', vers: '    if (!variante) {' },
  { nom: '🔴 la consommation d un lot redevient le nombre de lots', fichier: REGLE,
    de: '      quantite_stock: quantite * (deal?.unites_par_deal || 1),', vers: '      quantite_stock: quantite,' },
  // ─── les routes ─────────────────────────────────────────────────────────
  { nom: '🔴 la route en ligne ne passe pas les groupes à la règle', fichier: EN_LIGNE,
    de: '      groupesOptions: groupesOptions || [],', vers: '' },
  { nom: '🔴 la route en ligne relit toutes les options de la plateforme', fichier: EN_LIGNE,
    de: ".select(SELECT_OPTIONS_VALEURS).in('article_options_groupes.article_id', articleIds),", vers: '.select(SELECT_OPTIONS_VALEURS),' },
  { nom: '🔴 la route en ligne ignore une lecture d options en échec', fichier: EN_LIGNE,
    de: '    if (errOptions || errGroupes) {', vers: '    if (false) {' },
  { nom: '🔴 la route en ligne n enregistre plus la consommation réelle', fichier: EN_LIGNE,
    de: '        quantite_stock: l.quantite_stock,', vers: '' },
  { nom: '🔴 la route en ligne perd le second article du duo', fichier: EN_LIGNE,
    de: '        duo_article_id: l.deal_article2_id || null,', vers: '' },
  { nom: '🔴 la route rendez-vous ne passe pas les groupes', fichier: RDV,
    de: '      groupesOptions: groupesOptions || [],', vers: '' },
  { nom: '🔴 la route rendez-vous n enregistre plus la consommation réelle', fichier: RDV,
    de: '        quantite_stock: l.quantite_stock,', vers: '' },
  { nom: '🔴 la route encodée ne passe pas les groupes', fichier: ENCODEE,
    de: '      groupesOptions: groupesOptions || [],', vers: '' },
  { nom: '⚠️ la route encodée ignore une lecture de groupes en échec', fichier: ENCODEE,
    de: '    if (eA || eO || eV || eD || eG) return non(', vers: '    if (eA || eO || eV || eD) return non(' },
  { nom: '🔴 le tableau de bord recompte des lots au lieu des unités', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      .from('consommation_stock')", vers: "      .from('commande_articles')" },
  // ─── les écrans ─────────────────────────────────────────────────────────
  { nom: '🔴 la fiche détaillée ajoute de nouveau sans les options', fichier: FICHE,
    de: '          ) : (!hasVar && onAjouter && !article.est_vitrine && groupes.length > 0) ? (', vers: '          ) : (false) ? (' },
  { nom: '🔴 la fiche détaillée perd les options choisies', fichier: FICHE,
    de: 'onAjouter={peutCommander ? (a, opts = null) => ajouterAuPanier(a, opts) : null}', vers: 'onAjouter={peutCommander ? (a) => ajouterAuPanier(a) : null}' },
  { nom: '🔴 le panier venu du rendez-vous reprend un article sans son choix obligatoire', fichier: FICHE,
    de: "      if ((optionsParArticle[article.id] || []).some(g => g.obligatoire)) { ignores.push(article.nom); continue }", vers: '' },
  { nom: '🔴 le tunnel rendez-vous vend un article à choix obligatoire', fichier: TUNNEL,
    de: '&& Number(p.prix) > 0 && !p.choix_obligatoire', vers: '&& Number(p.prix) > 0' },
  { nom: '⚠️ une lecture d options en échec ouvre l achat de tout', fichier: TUNNEL,
    de: 'obligatoires = errGrp ? new Set(ids) : new Set(', vers: 'obligatoires = errGrp ? new Set() : new Set(' },
  { nom: '⚠️ l ajout direct ignore le choix obligatoire', fichier: TUNNEL,
    de: '    if (article?.choix_obligatoire) return', vers: '' },
  // ─── la migration ───────────────────────────────────────────────────────
  { nom: '🔴 duo_article_id retrouve sa clé étrangère (toutes les lectures article:articles refusées)', fichier: SQL,
    de: '  ADD COLUMN IF NOT EXISTS duo_article_id uuid;', vers: '  ADD COLUMN IF NOT EXISTS duo_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL;' },
  { nom: '🔴 l essai garde son second lien (pas de DROP)', fichier: SQL,
    de: 'ALTER TABLE public.commande_articles DROP CONSTRAINT IF EXISTS commande_articles_duo_article_id_fkey;', vers: '' },
  { nom: '🔴 la fiche redit « Personnalise ton »', fichier: FICHE,
    de: '>Ta personnalisation : {article.nom}</p>', vers: '>Personnalise ton {article.nom}</p>' },
  { nom: '🔴 le tableau de bord ne nomme plus le lien (lecture ambiguë, plus aucune commande)', fichier: 'app/dashboard/page.js',
    de: 'commande_articles(*, article:articles!commande_articles_article_id_fkey(*))', vers: 'commande_articles(*, article:articles(*))' },
  { nom: '🔴 la file des étiquettes ne nomme plus le lien', fichier: 'lib/file-etiquettes.js',
    de: 'article:articles!commande_articles_article_id_fkey(*)', vers: 'article:articles(*)' },
  { nom: '🔴 la vue oublie le second article du duo', fichier: SQL,
    de: '   WHERE ca.duo_article_id IS NOT NULL;', vers: '   WHERE false;' },
  { nom: '🔴 la vue ignore la RLS', fichier: SQL,
    de: 'CREATE OR REPLACE VIEW public.consommation_stock WITH (security_invoker = true) AS', vers: 'CREATE OR REPLACE VIEW public.consommation_stock AS' },
  { nom: '🔴 la vue est ouverte aux visiteurs', fichier: SQL,
    de: 'REVOKE ALL ON public.consommation_stock FROM PUBLIC, anon, authenticated;', vers: 'GRANT SELECT ON public.consommation_stock TO anon;' },
  { nom: '🔴 la réécriture ne vérifie plus le nombre de lectures', fichier: SQL,
    de: '    IF n <> r.attendu THEN', vers: '    IF false THEN' },
  { nom: '🔴 vendu_par_offre passe aussi par la vue (le plafond compterait des unités)', fichier: SQL,
    de: "       AND p.proname IN ('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin')", vers: "       AND p.proname IN ('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin', 'vendu_par_offre')" },
  // ─── 12/10 : LA ROUTE DES RENDEZ-VOUS ────────────────────────────────────
  { nom: '🔴 la route RDV rejette encore le nom vendu', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '        article_nom: l.article_nom,\n        variante_id', vers: '        variante_id' },
  { nom: '🔴 la route RDV rejette encore l’offre', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '        deal_id: l.deal_id || null,\n        quantite: l.quantite,', vers: '        quantite: l.quantite,' },
  { nom: '🔴 la route RDV ne vérifie plus le plafond des offres', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    if (!verifOffres.ok) {', vers: '    if (false) {' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }
const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
