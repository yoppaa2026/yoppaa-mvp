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
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (audit R2 : `minRegle`, puis le nombre d'options).
    de: "  const minRegle = Number.isInteger(g?.choix_min) ? g.choix_min : (g?.obligatoire ? 1 : 0)", vers: '  const minRegle = Number.isInteger(g?.choix_min) ? g.choix_min : 0' },
  { nom: '🔴 une valeur facultative suffit à l obligatoire', fichier: REGLE,
    de: '      choixParGroupe[v.groupe_id] = (choixParGroupe[v.groupe_id] || 0) + 1', vers: '      for (const gid of Object.keys(groupesParArticle).flatMap(a => groupesParArticle[a].map(x => x.id))) choixParGroupe[gid] = (choixParGroupe[gid] || 0) + 1' },
  { nom: '🔴 le choix d un autre article compte', fichier: REGLE,
    de: '          if (!grp || grp.article_id !== article.id) continue', vers: '          if (!grp) continue' },
  { nom: '🔴 une offre (lot) exige aussi les options : les invendus deviennent invendables', fichier: REGLE,
    // ⚠️ ANCRE REPOINTÉE LE 22/10 : une version exige maintenant ses options.
    de: '    if (!deal && groupesOptions) {', vers: '    if (groupesOptions) {' },
  { nom: '🔴 une version (taille, couleur) n exige plus ses options', fichier: REGLE,
    de: '    if (!deal && groupesOptions) {', vers: '    if (!deal && !variante && groupesOptions) {' },
  { nom: '🔴 deux lignes de la même variante passent chacune sur un stock de 1', fichier: REGLE,
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (audit R3 : `stockDeVariante`).
    // ⚠️ ANCRE REPOINTÉE LE 24/10 (Caprice : la part fournisseur passe avant).
    de: '      if (quantiteFournisseur === 0 && stockDeVariante(article, variante) < dejaParVariante[variante.id]) {', vers: '      if (quantiteFournisseur === 0 && stockDeVariante(article, variante) < quantite) {' },
  { nom: '🔴 la consommation d un lot redevient le nombre de lots', fichier: REGLE,
    de: '      quantite_stock: quantite * (deal?.unites_par_deal || 1),', vers: '      quantite_stock: quantite,' },
  // ─── (21/10) le groupe dépendant ────────────────────────────────────────
  { nom: '🔴 le serveur accepte des crudités sans « Avec crudités »', fichier: REGLE,
    de: '        if (parent && !vues.has(parent)) {', vers: '        if (false) {' },
  { nom: '🔴 le refus de dépendance ne vaut plus sur une offre', fichier: REGLE,
    de: '    if (groupesOptions) {', vers: '    if (groupesOptions && !item.deal_id) {' },
  { nom: '🔴 un groupe dépendant obligatoire est exigé sans son option', fichier: REGLE,
    de: '        if (g.depend_de_valeur_id && !vues.has(g.depend_de_valeur_id)) continue', vers: '' },
  { nom: '🔴 le ticket garde l ordre des clics', fichier: REGLE,
    de: '      choisies.splice(0, choisies.length, ...ordre)', vers: '' },
  { nom: '🔴 le serveur ne lit plus la condition des groupes', fichier: REGLE,
    de: "choix_min, choix_max, depend_de_valeur_id'", vers: "choix_min, choix_max'" },
  { nom: '🔴 « Sans crudités » ne vide plus les crudités cochées', fichier: 'lib/options-choix.js',
    de: '  const fin = (sel) => ({ selections: purgerInactifs(sel, groupes), plein: false })', vers: '  const fin = (sel) => ({ selections: sel, plein: false })' },
  { nom: '🔴 le total à l écran compte un groupe caché', fichier: 'lib/options-choix.js',
    de: '  const sel = Array.isArray(groupes) ? purgerInactifs(selections, groupes) : selections', vers: '  const sel = selections' },
  { nom: '🔴 un groupe dépendant devient le groupe des tailles', fichier: 'lib/options-choix.js',
    de: '.filter(g => g && g.id !== groupeIdExclu && !estDependant(g) && bornesChoix(g).max === 1', vers: '.filter(g => g && g.id !== groupeIdExclu && bornesChoix(g).max === 1' },
  { nom: '🔴 le groupe dépendant obligatoire passe avant son parent facultatif', fichier: 'lib/options-choix.js',
    de: '  const liste = tous.filter(g => !estDependant(g))', vers: '  const liste = tous' },
  { nom: '🔴 la fiche exige un groupe caché', fichier: FICHE,
    de: '    groupesActifs(groupes, selections).forEach(g => {', vers: '    groupes.forEach(g => {' },
  { nom: '🔴 le tunnel RDV écarte un article pour un groupe dépendant', fichier: TUNNEL,
    de: '.filter(g => !g.depend_de_valeur_id && bornesChoix(g).min > 0)', vers: '.filter(g => bornesChoix(g).min > 0)' },
  // ─── (21/10) le lien groupes ↔ valeurs, nommé avant le groupe dépendant ──
  { nom: '🔴 la duplication d article relit les options par un lien anonyme', fichier: 'app/dashboard/ConfigDashboard.js',
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (audit R4 : les prix par taille suivent).
    de: "      .select('*, valeurs:article_options_valeurs!article_options_valeurs_groupe_id_fkey(*, prix_taille:article_options_prix_taille!article_options_prix_taille_valeur_id_fkey(taille_valeur_id, prix))')", vers: "      .select('*, valeurs:article_options_valeurs(*, prix_taille:article_options_prix_taille!article_options_prix_taille_valeur_id_fkey(taille_valeur_id, prix))')" },
  { nom: '🔴 le paiement lit les valeurs avec un groupe anonyme', fichier: REGLE,
    de: "groupe_id, article_options_groupes!article_options_valeurs_groupe_id_fkey!inner(article_id, nom)'", vers: "groupe_id, article_options_groupes!inner(article_id, nom)'" },
  { nom: '🔴 l encodage lit les valeurs par un lien anonyme', fichier: 'app/api/equipe/commande/catalogue/route.js',
    de: 'created_at, valeurs:article_options_valeurs!article_options_valeurs_groupe_id_fkey(id,', vers: 'created_at, valeurs:article_options_valeurs(id,' },
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
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (audit R2 : un groupe sans option ne compte pas).
    de: '          ) : (!hasVar && onAjouter && !article.est_vitrine && groupes.some(groupeAvecOptions)) ? (', vers: '          ) : (false) ? (' },
  { nom: '🔴 la fiche détaillée perd les options choisies', fichier: FICHE,
    de: 'onAjouter={peutCommander ? (a, opts = null) => ajouterAuPanier(a, opts) : null}', vers: 'onAjouter={peutCommander ? (a) => ajouterAuPanier(a) : null}' },
  // ⚠️ ANCRE REPOINTÉE LE 13/10 (`bornesChoix`).
  { nom: '🔴 le panier venu du rendez-vous reprend un article sans son choix obligatoire', fichier: FICHE,
    // ⚠️ ANCRE REPOINTÉE LE 21/10 (groupe dépendant : seuls les groupes actifs comptent).
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (audit R1/R2 : bornes du client, version exigée).
    de: "      if (article.gere_variantes || groupesActifs(optionsParArticle[article.id] || [], {}).some(g => bornesPourLeClient(g).min > 0)) { ignores.push(article.nom); continue }", vers: '' },
  // ─── 13/10 : les écrans suivent les bornes et le prix par taille ─────────
  { nom: '🔴 le tunnel RDV ne voit plus les groupes à nombre minimum', fichier: TUNNEL,
    // ⚠️ ANCRES REPOINTÉES LE 21/10 (groupe dépendant).
    de: 'new Set((grp || []).filter(g => !g.depend_de_valeur_id && bornesChoix(g).min > 0).map(g => g.article_id))', vers: 'new Set((grp || []).filter(g => !g.depend_de_valeur_id && g.obligatoire).map(g => g.article_id))' },
  { nom: '🔴 la fiche additionne de nouveau le prix unique', fichier: FICHE,
    de: '  const supplement = supplementDeSelection(selections, groupes)', vers: '  const supplement = Object.values(selections).flat().reduce((a, v) => a + Number(v.prix_supplement || 0), 0)' },
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
  // ⚠️ ANCRE REPOINTEE LE 13/10 : l'ordre a trois blocs (taille, obligatoires, facultatifs).
  { nom: '⚠️ la taille ne passe plus en premier', fichier: 'lib/options-choix.js',
    de: '    ...(enTete ? [enTete] : []),', vers: '' },
  { nom: '🔴 les obligatoires ne passent plus avant les facultatifs', fichier: 'lib/options-choix.js',
    de: '    ...reste.filter(g => bornesChoix(g).min >= 1),', vers: '    ...reste.filter(() => false),' },
  { nom: '⚠️ une cuisson facultative passe devant la boisson imposee', fichier: 'lib/options-choix.js',
    de: "  const enTete = tailles && (bornesChoix(tailles).min >= 1 || NOM_DE_TAILLE.test(tailles.nom || '')) ? tailles : null", vers: '  const enTete = tailles' },
  // ─── 13/10 : les prix par taille depuis la bibliotheque ──────────────────
  { nom: '🔴 un prix se rattache a la taille d un AUTRE article', fichier: 'lib/options-choix.js',
    de: "    const t = groupeDesTailles(groupesParArticle[String(g?.article_id)] || [], g?.id)", vers: "    const t = groupeDesTailles(Object.values(groupesParArticle).flat(), g?.id)" },
  { nom: '⚠️ un article sans tailles n est plus compte', fichier: 'lib/options-choix.js',
    de: '      if (!t) { sansTaille.add(String(g.article_id)); continue }', vers: '      if (!t) { continue }' },
  { nom: '🔴 les anciens prix ne sont plus remplaces', fichier: 'lib/options-choix.js',
    de: '      valeurIds.push(v.id)', vers: '' },
  { nom: '🔴 une saisie absurde passe', fichier: 'lib/options-choix.js',
    de: "      if (prix > 500) return { ok: false, error: `« ${o.nom} » en ${taille} : 500 € au maximum.` }", vers: '' },
  { nom: '⚠️ « m » et « M » font deux tailles', fichier: 'lib/options-choix.js',
    // Seul `toLowerCase()` du fichier (vérifié le 13/10) ; la ligne porte de
    // vrais accents combinants, qu'on ne recopie pas dans une ancre.
    de: ".trim().replace(/\\s+/g, ' ').toLowerCase()", vers: '.trim()' },
  { nom: '🔴 le chargement commun oublie de nouveau le nombre de choix', fichier: 'app/dashboard/ConfigDashboard.js',
    // La ligne est unique dans le fichier (vérifié le 13/10).
    de: '        .select(SELECT_GROUPES_AVEC_VALEURS)', vers: "        .select('id, article_id, nom, type, obligatoire, valeurs:article_options_valeurs(*)')" },
  { nom: '🔴 la modification ecrit les prix par taille sans controle prealable', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    if (!saisieTaille.ok) { toast(saisieTaille.error, 'error'); return }", vers: '' },
  { nom: '🔴 « Appliquer a… » perd les prix par taille', fichier: 'app/dashboard/ConfigDashboard.js',
    // ⚠️ ANCRE RECALÉE LE 15/10 : « Appliquer / retirer… » n'écrit que s'il y a à poser.
    de: 'await ecrireCopiesDeGroupe(entree.modele, aCopier, groupesParArticle) : { ok: true, combien: 0 }', vers: 'await ecrireCopiesDeGroupe(entree.modele, aCopier) : { ok: true, combien: 0 }' },

  { nom: '🔴 « Choisis-en un » revient (le client se sent oblige)', fichier: 'lib/options-choix.js',
    de: '  if (max === 1) return null', vers: '' },
  { nom: '⚠️ « Cumulables » revient', fichier: 'lib/options-choix.js',
    de: '  if (!Number.isFinite(max) && min <= 1) return null', vers: '' },
  { nom: '⚠️ une option seule et facultative reprend un rond', fichier: 'lib/options-choix.js',
    de: '  return max === 1 && ((groupe?.valeurs || []).length > 1 || min >= 1)', vers: '  return max === 1' },
  { nom: '🔴 la fiche reprend « Choisis-en un » pour tous', fichier: FICHE,
    de: '        const pastille = pastilleBornes(g)', vers: '        const pastille = libelleBornes(g)' },
  { nom: '⚠️ la fiche ignore l ordre des groupes', fichier: FICHE,
    // ⚠️ ANCRE REPOINTÉE LE 22/10 (audit R2 : les groupes sans option sont cachés).
    de: '      {ordonnerGroupes(groupes).filter(g => groupeAvecOptions(g) && groupeActif(g, selections)).map(g => {', vers: '      {groupes.filter(g => groupeAvecOptions(g) && groupeActif(g, selections)).map(g => {' },
  // ─── 13/10 : le réglage du commerçant ────────────────────────────────────
  { nom: '🔴 le réglage accepte un minimum au-dessus du maximum', fichier: 'lib/options-choix.js',
    de: "  if (min !== null && max !== null && min > max) return { ok: false, error: 'Le minimum dépasse le maximum.' }", vers: '' },
  { nom: '🔴 un prix par taille absurde passe', fichier: 'lib/options-choix.js',
    de: "    if (prix > 500) return { ok: false, error: '500 € au maximum.' }", vers: '' },
  { nom: '🔴 le groupe des tailles peut être un groupe à plusieurs choix', fichier: 'lib/options-choix.js',
    de: '    .filter(g => g && g.id !== groupeIdExclu && !estDependant(g) && bornesChoix(g).max === 1 && (g.valeurs || []).length > 1)', vers: '    .filter(g => g && g.id !== groupeIdExclu && !estDependant(g) && (g.valeurs || []).length > 1)' },
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
  // ─── (22/10) l'audit Articles + Personnalisation ─────────────────────────
  { nom: '🔴 R1 : un article à variantes repart sans sa version', fichier: REGLE,
    de: '    if (!variante && !deal && article.gere_variantes === true) {', vers: '    if (false) {' },
  { nom: '🔴 R1 : le serveur ne lit plus gere_variantes', fichier: REGLE,
    // ⚠️ ANCRE REPOINTÉE LE 24/10 (Caprice : `fournisseur_jours` suit).
    de: "retrait_des, retrait_jusqua, gere_variantes, fournisseur_jours'", vers: "retrait_des, retrait_jusqua, fournisseur_jours'" },
  { nom: '🔴 R2 : le serveur exige un groupe sans assez d options', fichier: REGLE,
    de: '        const { min, max } = bornesChoix(g, nbValeursParGroupe[g.id] || 0)', vers: '        const { min, max } = bornesChoix(g)' },
  { nom: '🔴 R2 : le nombre d options ne compte plus', fichier: REGLE,
    de: '  const min = Number.isInteger(nbValeurs) && minRegle > nbValeurs ? 0 : minRegle', vers: '  const min = minRegle' },
  { nom: '🔴 R2 : le serveur compte mal les options', fichier: REGLE,
    de: '    if (v?.groupe_id) nbValeursParGroupe[v.groupe_id] = (nbValeursParGroupe[v.groupe_id] || 0) + 1', vers: '    if (v?.groupe_id) nbValeursParGroupe[v.groupe_id] = 99' },
  { nom: '🔴 R2 : la fiche exige de nouveau un groupe vide', fichier: 'lib/options-choix.js',
    de: '  return bornesChoix(groupe, Array.isArray(groupe?.valeurs) ? groupe.valeurs.length : null)', vers: '  return bornesChoix(groupe)' },
  { nom: '🔴 R2 : le commerçant n est plus prévenu d un groupe obligatoire vide', fichier: 'lib/options-choix.js',
    de: "  if (min > 0 && nb === 0) return 'Obligatoire, mais sans option : ajoute ses options, ou rends-le facultatif.'", vers: '' },
  { nom: '🔴 R2 : ni d un minimum au-delà des options', fichier: 'lib/options-choix.js',
    de: "  if (min > nb) return `Demande ${min} choix, mais n’a que ${nb} option${nb > 1 ? 's' : ''}.`", vers: '' },
  { nom: '🔴 O7 : « Optionnel » garde le minimum', fichier: 'lib/options-choix.js',
    de: '  return { obligatoire: !pastillesDuGroupe(groupe).obligatoire, choix_min: null }', vers: '  return { obligatoire: !groupe.obligatoire }' },
  { nom: '🔴 O7 : « 1 choix » garde les bornes', fichier: 'lib/options-choix.js',
    de: "  return { type: p.unique ? 'multiple' : 'unique', choix_min: null, choix_max: null, obligatoire: p.obligatoire }", vers: "  return { type: groupe.type === 'unique' ? 'multiple' : 'unique' }" },
  { nom: '🔴 O7 : les pastilles relisent le réglage brut', fichier: 'lib/options-choix.js',
    de: '  return { unique: max === 1, obligatoire: min > 0 }', vers: "  return { unique: groupe?.type === 'unique', obligatoire: !!groupe?.obligatoire }" },
  { nom: '🔴 R3 : le serveur compte le stock d une version à la demande', fichier: REGLE,
    // ⚠️ ANCRE REPOINTÉE LE 24/10 (Caprice : la part fournisseur passe avant).
    de: '      if (quantiteFournisseur === 0 && stockDeVariante(article, variante) < dejaParVariante[variante.id]) {', vers: '      if (quantiteFournisseur === 0 && (variante.stock ?? 0) < dejaParVariante[variante.id]) {' },
  { nom: '🔴 R3 : la vente prélève une version à la demande', fichier: 'lib/stock-variantes-server.js',
    de: '    if (variantesSansLimite(articleParId[l.article_id])) continue', vers: '' },
  { nom: '🔴 R3 : l annulation rend à une version à la demande', fichier: 'lib/stock-variantes-server.js',
    de: '  const libres = new Set((data || []).filter(variantesSansLimite).map(a => a.id))', vers: '  const libres = new Set()' },
  { nom: '🔴 R3 : la règle « à la demande » oublie les variantes', fichier: 'lib/stock-article.js',
    de: '  if (variantesSansLimite(article)) return Infinity', vers: '' },
  { nom: '🔴 R1 fiche : sans version active, l article se vend comme un simple', fichier: FICHE,
    de: '  const sansVersion = !!article.gere_variantes && variantes.length === 0', vers: '  const sansVersion = false' },
  { nom: '🔴 R1 fiche : les options d un article à variantes se vendent seules', fichier: FICHE,
    de: '  const hasOptions = !article.gere_variantes && groupes.some(groupeAvecOptions)', vers: '  const hasOptions = !hasVariantes && groupes.length > 0' },
  { nom: '🔴 R1 fiche détaillée : sans version, retour à l ajout simple', fichier: FICHE,
    de: '          ) : (article.gere_variantes && !article.est_vitrine) ? (', vers: '          ) : (false) ? (' },
  { nom: '🔴 R3 fiche : le sélecteur compte le stock d une version à la demande', fichier: FICHE,
    de: '  const stockDe = (v) => stockDeVariante(article, v)', vers: '  const stockDe = (v) => v.stock' },
  { nom: '🔴 R3 fiche : le panier bloque une version à la demande', fichier: FICHE,
    // ⚠️ ANCRE REPOINTÉE LE 24/10 (Caprice : `fournisseurJours` suit).
    de: 'sansLimite: stockDeVariante(article, variante) === Infinity, fournisseurJours: jours }', vers: 'sansLimite: false, fournisseurJours: jours }' },
  { nom: '🔴 R2 éditeur : « au moins 3 » parmi 2 options passe', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    if ((r.choix_min || 0) > nbOptions) {', vers: '    if (false) {' },
  { nom: '🔴 O7 éditeur : la pastille ne remet plus les bornes à zéro', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '<button onClick={() => updateGroupe(g.id, basculeType(g))}', vers: "<button onClick={() => updateGroupe(g.id, { type: g.type === 'unique' ? 'multiple' : 'unique' })}" },
  { nom: '🔴 R2 éditeur : la pastille « À corriger » disparaît', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '              {problemeDuGroupe(g) && (', vers: '              {false && (' },
  { nom: '🟡 J2 : Entrée + clic crée l option deux fois', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    if (ajoutOption.current) return', vers: '' },
  // ✅ (23/10) le tunnel rendez-vous + produits prélève, et rend en cas d'échec.
  { nom: '🔴 le tunnel rendez-vous ne prélève plus ses versions', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    // ⚠️ ANCRE REPOINTÉE LE 24/10 (Caprice : l'appel passe la commande).
    de: '    await preleverStockVariantes(supabase, lignes, variantesData, articlesData, { commandeId: commande.id })', vers: '' },
  { nom: '🔴 un rendez-vous refusé garde les versions prélevées', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '        await restaurerStockVariantes(supabase, [commande.id])', vers: '' },
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
