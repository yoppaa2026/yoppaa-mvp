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
  // ⚠️ ANCRES REPOINTÉES LE 13/10 : l'obligatoire passe désormais par le
  // nombre de choix (`bornesChoix`, minimum 1), même but, même garde.
  { nom: '🔴 une option obligatoire manquante passe', fichier: REGLE,
    de: "  const min = Number.isInteger(g?.choix_min) ? g.choix_min : (g?.obligatoire ? 1 : 0)", vers: '  const min = Number.isInteger(g?.choix_min) ? g.choix_min : 0' },
  { nom: '🔴 une valeur facultative suffit à l obligatoire', fichier: REGLE,
    de: '      choixParGroupe[v.groupe_id] = (choixParGroupe[v.groupe_id] || 0) + 1', vers: '      for (const gid of Object.keys(groupesParArticle).flatMap(a => groupesParArticle[a].map(x => x.id))) choixParGroupe[gid] = (choixParGroupe[gid] || 0) + 1' },
  { nom: '🔴 le choix d un autre article compte', fichier: REGLE,
    de: '          if (!grp || grp.article_id !== article.id) continue', vers: '          if (!grp) continue' },
  { nom: '🔴 une offre (lot) exige aussi les options : les invendus deviennent invendables', fichier: REGLE,
    de: '    if (!deal && !variante && groupesOptions) {', vers: '    if (!variante && groupesOptions) {' },
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
  // ⚠️ ANCRE REPOINTÉE LE 13/10 (`bornesChoix`).
  { nom: '🔴 le panier venu du rendez-vous reprend un article sans son choix obligatoire', fichier: FICHE,
    de: "      if ((optionsParArticle[article.id] || []).some(g => bornesChoix(g).min > 0)) { ignores.push(article.nom); continue }", vers: '' },
  // ─── 13/10 : les écrans suivent les bornes et le prix par taille ─────────
  { nom: '🔴 le tunnel RDV ne voit plus les groupes à nombre minimum', fichier: TUNNEL,
    de: 'new Set((grp || []).filter(g => bornesChoix(g).min > 0).map(g => g.article_id))', vers: 'new Set((grp || []).filter(g => g.obligatoire).map(g => g.article_id))' },
  { nom: '🔴 la fiche additionne de nouveau le prix unique', fichier: FICHE,
    de: '  const supplement = supplementDeSelection(selections)', vers: '  const supplement = Object.values(selections).flat().reduce((a, v) => a + Number(v.prix_supplement || 0), 0)' },
  { nom: '🔴 la fiche laisse passer un groupe incomplet', fichier: FICHE,
    de: '      if (refus) { errs[g.id] = refus; ok = false }', vers: '' },
  { nom: '🔴 le total de la fiche ignore les prix par taille', fichier: FICHE,
    de: '        prixTaille: prixTailleDesGroupes(Object.values(optionsParArticle || {}).flat()),', vers: '' },
  { nom: '🔴 l encodage ignore les prix par taille', fichier: 'app/dashboard/ModalNouvelleCommande.js',
    de: '    prixTaille: prixTailleDesGroupes(Object.values(groupes).flat()),', vers: '' },
  { nom: '🔴 le catalogue de l encodage oublie le nombre de choix', fichier: 'app/api/equipe/commande/catalogue/route.js',
    de: 'obligatoire, choix_min, choix_max,', vers: 'obligatoire,' },
  { nom: '🔴 un groupe plein accepte un choix de plus', fichier: 'lib/options-choix.js',
    de: '  if (actuelles.length >= max) return { selections, plein: true }', vers: '' },
  { nom: '🔴 l écran affiche le prix unique malgré la taille', fichier: 'lib/options-choix.js',
    de: '  return p ? Number(p.prix) : Number(valeur?.prix_supplement || 0)', vers: '  return Number(valeur?.prix_supplement || 0)' },
  // ─── 13/10 : le réglage du commerçant ────────────────────────────────────
  { nom: '🔴 le réglage accepte un minimum au-dessus du maximum', fichier: 'lib/options-choix.js',
    de: "  if (min !== null && max !== null && min > max) return { ok: false, error: 'Le minimum dépasse le maximum.' }", vers: '' },
  { nom: '🔴 un prix par taille absurde passe', fichier: 'lib/options-choix.js',
    de: "    if (prix > 500) return { ok: false, error: '500 € au maximum.' }", vers: '' },
  { nom: '🔴 le groupe des tailles peut être un groupe à plusieurs choix', fichier: 'lib/options-choix.js',
    de: '    .filter(g => g && g.id !== groupeIdExclu && bornesChoix(g).max === 1 && (g.valeurs || []).length > 1)', vers: '    .filter(g => g && g.id !== groupeIdExclu && (g.valeurs || []).length > 1)' },
  { nom: '🔴 l écran écrit le nombre de choix sans le contrôler', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    const r = bornesDepuisSaisie(f.min ?? g.choix_min ?? '', f.max ?? g.choix_max ?? '')", vers: '    const r = { ok: true, choix_min: f.min, choix_max: f.max }' },
  { nom: '🔴 l écran efface les prix par taille de TOUT le groupe', fichier: 'app/dashboard/ConfigDashboard.js',
    de: ".from('article_options_prix_taille').delete().eq('valeur_id', v.id)", vers: ".from('article_options_prix_taille').delete().in('valeur_id', (g?.valeurs || []).map(x => x.id))" },
  { nom: '🔴 la lecture des groupes perd son lien nommé (PGRST201)', fichier: 'lib/options-choix.js',
    de: 'prix_taille:article_options_prix_taille!article_options_prix_taille_valeur_id_fkey(taille_valeur_id, prix)', vers: 'prix_taille:article_options_prix_taille(taille_valeur_id, prix)' },
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
  // ─── 13/10 : PRIX SELON LA TAILLE ET NOMBRE DE CHOIX ─────────────────────
  { nom: '🔴 le prix par taille est ignoré (prix unique toujours)', fichier: REGLE,
    de: '      const prix = taille ? parTaille[taille.id] : Number(v.prix_supplement || 0)', vers: '      const prix = Number(v.prix_supplement || 0)' },
  { nom: '🔴 une valeur envoyée deux fois est comptée deux fois', fichier: REGLE,
    de: '          if (vues.has(vid)) continue', vers: '' },
  { nom: '🔴 le minimum de choix n est plus vérifié', fichier: REGLE,
    de: '        if (n < min) {', vers: '        if (false) {' },
  { nom: '🔴 le maximum de choix n est plus vérifié', fichier: REGLE,
    de: '        if (n > max) {', vers: '        if (false) {' },
  { nom: '🔴 un choix unique accepte plusieurs valeurs', fichier: REGLE,
    de: "  const max = Number.isInteger(g?.choix_max) ? g.choix_max : (g?.type === 'unique' ? 1 : Infinity)", vers: '  const max = Number.isInteger(g?.choix_max) ? g.choix_max : Infinity' },
  { nom: '🔴 la route en ligne ne lit plus les prix par taille', fichier: EN_LIGNE,
    de: '      prixTaille: prixTaille || [],', vers: '' },
  { nom: '🔴 une lecture ratée des prix par taille passe en silence (en ligne)', fichier: EN_LIGNE,
    de: '    if (errPrixTaille) {', vers: '    if (false) {' },
  { nom: '🔴 la route encodée ne lit plus les prix par taille', fichier: 'app/api/equipe/commande/creer/route.js',
    de: '      prixTaille: prixTaille || [],', vers: '' },
  { nom: '🔴 la route RDV ne lit plus les prix par taille', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '      prixTaille: prixTaille || [],', vers: '' },
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
