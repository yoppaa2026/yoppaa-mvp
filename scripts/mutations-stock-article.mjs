// HARNAIS DE MUTATION — LE STOCK EN TROIS CHOIX ET LA VITRINE AU PRIX FERME
//
// Chaque mutation casse une chose précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:stock-article

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:stock-article'
const LIB = 'lib/stock-article.js'
const FICHE = 'app/commander/[slug]/page.js'
const RDV = 'app/commander/rdv/[slug]/page.js'
const BORD = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── LA RÈGLE ────────────────────────────────────────────────────────────
  { nom: '🔴 une valeur inconnue devient « sans limite »',
    fichier: LIB, de: "  return MODES_STOCK.includes(article?.stock_mode) ? article.stock_mode : 'jour'", vers: "  return MODES_STOCK.includes(article?.stock_mode) ? article.stock_mode : 'illimite'" },
  { nom: '🔴 une boutique naît sans limite',
    fichier: LIB, de: "  if (['detail', 'vitrine'].includes(commercant?.categorie)) return 'magasin'", vers: '' },
  { nom: '🔴 une quantité par jour de 0 passe',
    fichier: LIB, de: "  if (mode === 'jour' && Number(brut) < 1) {", vers: '  if (false) {' },
  { nom: '🔴 une quantité vide passe',
    fichier: LIB, de: "  if (!/^\\d+$/.test(brut)) {", vers: '  if (false) {' },
  { nom: '🔴 sans limite écrit la quantité saisie',
    fichier: LIB, de: "  const quantite = m === 'illimite' ? 0 : Math.max(0, parseInt(String(saisie ?? ''), 10) || 0)", vers: "  const quantite = Math.max(0, parseInt(String(saisie ?? ''), 10) || 0)" },
  { nom: '🔴 chaque enregistrement remet les ventes à zéro',
    fichier: LIB, de: "    && (!avant || modeStockDe(avant) !== 'magasin' || Number(avant.stock_jour || 0) !== quantite)", vers: '' },
  { nom: '🔴 « indisponible ce jour » ne vaut plus sans limite',
    fichier: LIB, de: '  if (entreeJour && entreeJour.actif === false) return { actif: false, gere: true, brut: 0, dispo: 0 }', vers: '' },
  { nom: '🔴 sans limite obéit à une quantité qui traîne',
    fichier: LIB, de: "  if (mode === 'illimite') return { actif: true, gere: false, brut: 0, dispo: Infinity }", vers: '' },
  { nom: '🔴 en magasin, 0 redevient sans limite',
    fichier: LIB, de: '    return { actif: true, gere: true, brut, dispo: Math.max(0, brut - deja) }', vers: '    return { actif: true, gere: brut > 0, brut, dispo: brut > 0 ? Math.max(0, brut - deja) : Infinity }' },
  { nom: '⚠️ par jour, la quantité de l article l emporte sur le jour',
    fichier: LIB, de: '  const brut = entreeJour ? Math.max(0, Number(entreeJour.stock) || 0) : Math.max(0, Number(article?.stock_jour) || 0)', vers: '  const brut = Math.max(0, Number(article?.stock_jour) || 0)' },
  { nom: '🔴 par jour sans quantité devient épuisé',
    fichier: LIB, de: '  return { actif: true, gere, brut, dispo: gere ? Math.max(0, brut - deja) : Infinity }', vers: '  return { actif: true, gere: true, brut, dispo: Math.max(0, brut - deja) }' },
  { nom: '🔴 un stock en magasin revient demain',
    fichier: LIB, de: "  return modeStockDe(article) !== 'magasin'", vers: '  return true' },
  { nom: '⚠️ la boutique dit « sur place »',
    fichier: LIB, de: "  if (commercant?.categorie === 'detail') return 'Disponible en boutique'", vers: '' },

  { nom: '🔴 la vitrine ne dit plus ce qu elle fait',
    fichier: LIB, de: "    { vendable: false, titre: 'En vitrine seulement', phrase: surPlace },", vers: "    { vendable: false, titre: 'En vitrine seulement', phrase: '' }," },
  { nom: '⚠️ la boutique lit « sur place »',
    fichier: LIB, de: "  const surPlace = commercant?.categorie === 'detail'", vers: '  const surPlace = false' },
  { nom: '🔴 le choix « vendu en ligne » ne règle plus rien',
    fichier: BORD, de: '            onChoisir={c => setForm(p => ({ ...p, vendable: c.vendable }))}/>', vers: '            onChoisir={() => {}}/>' },
  { nom: '🔴 le choix « sur ta fiche » ne règle plus rien',
    fichier: BORD, de: '            onChoisir={c => setForm(p => ({ ...p, actif: c.actif }))}/>', vers: '            onChoisir={() => {}}/>' },
  { nom: '🔴 la carte de choix n appelle plus rien',
    fichier: BORD, de: '              onClick={() => onChoisir(c)}', vers: '              onClick={() => {}}' },
  { nom: '⚠️ « masqué » ne dit plus ce qu il fait',
    fichier: LIB, de: "  { actif: false, titre: 'Masqué', phrase: 'Tes clients ne le voient plus. Il reste ici, prêt à revenir.' },", vers: "  { actif: false, titre: 'Masqué', phrase: '' }," },

  // ─── LA FICHE ────────────────────────────────────────────────────────────
  { nom: '🔴 la limite du panier recalcule à sa façon',
    // ⚠️ Ancre reorientee le 07/10 : le jour passe (comptoir). Et le 08/10 :
    // le circuit et l invendu (temps 3).
    fichier: FICHE, de: '    return etatStock({ article, entreeJour: entryDay, dejaCommande, jour, circuit, invendu }).dispo', vers: '    return (article.stock_jour > 0) ? Math.max(0, article.stock_jour - dejaCommande) : Infinity' },
  // 🔴 LE COMPTOIR DU JOUR (07/10).
  { nom: '🔴 le comptoir ne plafonne plus rien a l ecran',
    fichier: 'lib/stock-article.js', de: '  if (comptoir !== null) return { actif: true, gere: true, brut: comptoir, dispo: Math.max(0, comptoir - deja) }', vers: '' },
  { nom: '🔴 un comptoir de mardi plafonne mercredi',
    fichier: 'lib/stock-article.js', de: '  if (!article || !jour || article.stock_comptoir_le !== jour) return null', vers: '  if (!article) return null' },
  { nom: '🔴 le comptoir se date du jour de la machine',
    fichier: 'app/dashboard/ConfigDashboard.js', de: 'stock_comptoir_le: jourBruxelles() }', vers: 'stock_comptoir_le: new Date().toISOString().slice(0, 10) }' },
  { nom: '🔴 le bouton du comptoir reste visible le soir',
    // ⚠️ Ancre reorientee le 08/10 : `venteJour` s ajoute (temps 3).
    fichier: 'app/dashboard/ConfigDashboard.js', de: '            {parJours && venteJour && onSetComptoir && !effAuj.ferme && !congeAuj && !journeeFinie && (', vers: '            {parJours && venteJour && onSetComptoir && !effAuj.ferme && !congeAuj && (' },
  { nom: '🔴 la grille affiche de nouveau le comptoir (« Mer 3 »)',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '    if (avecComptoir && jour === jourActuelKey && comptoirAuj !== null) {', vers: '    if (jour === jourActuelKey && comptoirAuj !== null) {' },
  { nom: '🔴 « Retirer le comptoir » disparait le soir',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '            {onSetComptoir && effAuj.comptoir && (', vers: '            {onSetComptoir && effAuj.comptoir && !journeeFinie && (' },
  { nom: '🔴 le formulaire ne dit plus que la grille le remplace',
    fichier: 'app/dashboard/ConfigDashboard.js', de: "                  {form.stock_mode === 'jour' && editId && (() => {", vers: "                  {false && (() => {" },
  { nom: '🔴 revenir au defaut efface aussi les jours fermes',
    fichier: 'app/dashboard/ConfigDashboard.js', de: "      .delete().eq('article_id', articleId).eq('actif', true)\n    if (error) { toast(`Les quantités", vers: "      .delete().eq('article_id', articleId)\n    if (error) { toast(`Les quantités" },
  // ✅ « ODOO MIND » (07/10).
  { nom: '🔴 le croissant redevient « Stock en magasin » en alimentaire',
    // ⚠️ Ancre reorientee le 08/10 : la carte s appelle « Stock qui baisse »
    // (mots du modele valide par Alex), toujours pas « Stock en magasin ».
    fichier: 'lib/stock-article.js', de: "    titre: 'Stock qui baisse',", vers: "    titre: 'Stock en magasin'," },
  { nom: '🔴 les exemples disparaissent des cartes',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '                {c.exemples && (', vers: '                {false && (' },
  { nom: '🔴 le temps de preparation revient partout',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '              {estAlimentaire && (capaciteEnMinutes || Number(form.temps_prepa) > 0) && (', vers: '              {estAlimentaire && (' },
  { nom: '🔴 le stock repasse en pastilles muettes (cartes debranchees)',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '                estChoisi={c => form.stock_mode === c.mode}', vers: '                estChoisi={() => false}' },
  { nom: '🔴 le comptoir du jour oublie le deja commande',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '      const maj = { stock_comptoir: reste + deja, stock_comptoir_le: jour }', vers: '      const maj = { stock_comptoir: reste, stock_comptoir_le: jour }' },
  { nom: '🔴 le comptoir du jour liste aussi les articles sans limite',
    // ⚠️ Ancre reorientee le 08/10 : le circuit A s ajoute au filtre.
    fichier: 'app/dashboard/ConfigDashboard.js', de: "    return articles.filter(a => a.actif !== false && a.est_vitrine !== true && modeStockDe(a) === 'jour' && (!deuxCircuits || a.vente_jour !== false))", vers: '    return articles.filter(a => a.actif !== false && a.est_vitrine !== true && (!deuxCircuits || a.vente_jour !== false))' },
  { nom: '🔴 un echec du comptoir passe pour un succes',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '    const ok = resultats.filter(r => !r.error)', vers: '    const ok = resultats' },
  { nom: '🔴 le comptoir se saisit le soir',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '                <button type="button" onClick={enregistrerComptoir} disabled={envoiComptoir || journeeFinieAuj}', vers: '                <button type="button" onClick={enregistrerComptoir} disabled={envoiComptoir}' },
  { nom: '🔴 la journee ne finit jamais',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '    return f !== null && m !== null && m >= f', vers: '    return false' },
  { nom: '🔴 le reste saisi oublie le deja commande',
    // ⚠️ Ancre reorientee le 07/10 : le bloc a ete scinde (indentation).
    fichier: 'app/dashboard/ConfigDashboard.js', de: '                  onSetComptoir(a.id, reste + dejaCommande)', vers: '                  onSetComptoir(a.id, reste)' },
  { nom: '🔴 la carte promet « demain » sur un stock en magasin',
    // ⚠️ Ancre reorientee le 08/10 : la condition vit dans `revient` (temps 3).
    fichier: FICHE, de: '  const revient = revientUnAutreJour(article) && (circuit === null || article.commande_active === true)', vers: '  const revient = true' },
  { nom: '🔴 le « dès » revient sur la fiche',
    fichier: FICHE, de: "                  <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}>{euros(Number(article.prix))}</p>", vers: "                  <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}><span>dès</span> {euros(Number(article.prix))}</p>" },
  { nom: '🔴 en vitrine, les versions s achètent',
    fichier: FICHE, de: '      {showOptions && hasVariantes && !article.est_vitrine && (', vers: '      {showOptions && hasVariantes && (' },
  { nom: '⚠️ en vitrine, une pastille « Épuisé » s affiche',
    // ⚠️ Ancre reorientee le 07/10 : `!etatJour` suit (l article hors du jour choisi).
    fichier: FICHE, de: '          {!hasVariantes && stockGere && !article.est_vitrine && !etatJour && (() => {', vers: '          {!hasVariantes && stockGere && !etatJour && (() => {' },
  { nom: '🔴 la fenêtre de l article vend en vitrine',
    fichier: FICHE, de: '          ) : (!hasVar && onAjouter && !article.est_vitrine) ? (', vers: '          ) : (!hasVar && onAjouter) ? (' },
  { nom: '🔴 « Sur demande » revient sur la fiche des rendez-vous',
    fichier: RDV, de: '  if (prix != null) return `${euros(prix)}`', vers: "  if (prix != null) return `${euros(prix)}`; if (prestation) return 'Sur demande'" },

  // ─── LE TABLEAU DE BORD ──────────────────────────────────────────────────
  { nom: '🔴 un article sans prix s enregistre',
    fichier: BORD, de: "    if (!form.nom.trim() || !(parseFloat(form.prix) > 0)) return toast('Nom et prix obligatoires', 'error')", vers: "    if (!form.nom.trim()) return toast('Nom et prix obligatoires', 'error')" },
  { nom: '🔴 la quantité n est plus vérifiée',
    fichier: BORD, de: '    if (refusStock) return toast(refusStock, \'error\')', vers: '' },
  { nom: '🔴 la vitrine redevient réservée aux services',
    fichier: BORD, de: '      est_vitrine: !form.vendable,', vers: '      est_vitrine: estVitrine ? !form.vendable : false,' },
  { nom: '🔴 sans limite garde ses quantités par jour',
    fichier: BORD, de: "        .delete().eq('article_id', editId).eq('actif', true)", vers: "        .select('id').eq('article_id', editId).eq('actif', true)" },
  { nom: '🔴 sans limite efface aussi les jours indisponibles',
    fichier: BORD, de: "        .delete().eq('article_id', editId).eq('actif', true)", vers: "        .delete().eq('article_id', editId)" },
  { nom: '🔴 un stock ajusté sur la carte garde son ancienne date',
    fichier: BORD, de: '    const maj = { stock_jour: n, stock_maj_le: new Date().toISOString() }', vers: '    const maj = { stock_jour: n }' },
  { nom: '⚠️ un article sans limite affiche 0 sur ses jours',
    // ⚠️ Ancre reorientee le 08/10 : « sur commande seulement » affiche ✓ (temps 3).
    fichier: BORD, de: "{afficheFerme ? '✕' : !venteJour ? '✓' : sansLimite ? '∞' : eff.dispo}", vers: "{afficheFerme ? '✕' : !venteJour ? '✓' : eff.dispo}" },
  { nom: '🔴 une prestation sans prix s enregistre',
    fichier: BORD, de: "    if (!formEstTable && String(form.prix ?? '').trim() === '') {", vers: '    if (false) {' },
  { nom: '🔴 le « Prix indicatif » revient au tableau de bord',
    fichier: BORD, de: "            const prixLabel = p.prix != null ? euros(p.prix) : 'Prix à indiquer'", vers: "            const prixLabel = p.prix != null ? euros(p.prix) : 'Prix sur demande'" },
  { nom: '🔴 la copie oublie le mode de stock',
    fichier: 'lib/catalogue-copie.js', de: "  'nom', 'description', 'prix', 'stock_jour', 'stock_mode', 'actif', 'categorie',", vers: "  'nom', 'description', 'prix', 'stock_jour', 'actif', 'categorie'," },

  // ─── TEMPS 3 : LES DEUX CIRCUITS (08/10) ─────────────────────────────────
  // La regle
  { nom: '🔴 B vend un article qui ne se prend pas sur commande',
    fichier: LIB, de: "    if (article?.commande_active !== true) return { actif: false, gere: true, brut: 0, dispo: 0, raison: 'pas_sur_commande' }", vers: '' },
  { nom: '🔴 B oublie ce qui est deja reserve',
    fichier: LIB, de: '    return { actif: true, gere: true, brut: max, dispo: Math.max(0, max - deja) }', vers: '    return { actif: true, gere: true, brut: max, dispo: max }' },
  { nom: '🔴 A vend aujourd hui un article sur commande seulement',
    fichier: LIB, de: "  if (circuit === 'A' && article?.vente_jour === false) {", vers: '  if (false) {' },
  { nom: '🔴 l invendu d un article sur commande est refuse a l ecran',
    fichier: LIB, de: '    if (invendu) return { actif: true, gere: false, brut: 0, dispo: Infinity }', vers: '' },
  { nom: '🔴 tous les jours deviennent A',
    fichier: LIB, de: "  return jour > aujourdhui ? 'B' : 'A'", vers: "  return 'A'" },
  { nom: '🔴 une ligne lue sans ses colonnes passe pour « sur commande »',
    fichier: LIB, de: '    surCommande: article?.commande_active === true,', vers: '    surCommande: article?.commande_active !== false,' },
  { nom: '🔴 un article ni le jour meme ni sur commande s enregistre',
    fichier: LIB, de: "  if (!a && !b) return 'Choisis au moins une façon de le vendre : le jour même, ou sur commande.'", vers: '' },
  { nom: '🔴 un delai reste ecrit hors de B',
    fichier: LIB, de: '    delai_minutes: b ? Math.max(1440, parseInt(form?.delai_minutes, 10) || 0) : 0,', vers: '    delai_minutes: parseInt(form?.delai_minutes, 10) || 0,' },
  { nom: '🔴 le sandwich se commande pour samedi',
    fichier: 'lib/delai-commande.js', de: "    if (!circuits.surCommande) return { raison: 'aujourdhui_seulement' }", vers: '' },
  { nom: '🔴 l invendu retrouve son delai',
    fichier: 'lib/delai-commande.js', de: '  if (invendu) return null', vers: '' },
  { nom: '🔴 la pizzeria s ouvre sur huit jours (A + B J+1)',
    fichier: 'lib/delai-commande.js', de: '      if (!a.circuits.aujourdhui || dB >= 2) n = Math.max(n, dB + FENETRE_APRES_DELAI)', vers: '      n = Math.max(n, dB + FENETRE_APRES_DELAI)' },
  { nom: '🔴 une mention sur chaque croissant (decor)',
    fichier: 'lib/delai-commande.js', de: '    if (nB === 1) return jours ? `${jours} seulement` : null', vers: '' },
  // Le serveur
  { nom: '🔴 serveur, A : la commande de la veille entame le comptoir',
    fichier: 'lib/lignes-commande.js', de: "    if (circuit === 'A' && jourBelgeDeCreation(r.commande?.created_at) !== dateCommande) return", vers: '' },
  { nom: '🔴 serveur, B : un article du jour meme se prend pour samedi',
    fichier: 'lib/lignes-commande.js', de: '      if (art?.commande_active !== true) {', vers: '      if (false) {' },
  { nom: '🔴 serveur : l invendu d un article sur commande est refuse',
    fichier: 'lib/lignes-commande.js', de: '      if (invenduParArticle[artId]) continue', vers: '' },
  { nom: '🔴 serveur : une tarte a l unite passe pour un invendu',
    fichier: 'lib/lignes-commande.js', de: '    invenduParArticle[ligne.article_id] = (invenduParArticle[ligne.article_id] ?? true) && inv', vers: '    invenduParArticle[ligne.article_id] = (invenduParArticle[ligne.article_id] ?? false) || inv' },
  { nom: '🔴 la reservation ne recoit plus le drapeau de l invendu',
    fichier: 'lib/lignes-commande.js', de: '    inv[article_id] ? { article_id, quantite, invendu: true } : { article_id, quantite }', vers: '    ({ article_id, quantite })' },
  { nom: '🔴 serveur : une lecture en echec vaut zero vendu',
    fichier: 'lib/lignes-commande.js', de: '  if (errGrille || errArticles || errCommandes || errReservations) {', vers: '  if (false) {' },
  { nom: '🔴 created_at lu comme une heure belge (23 h 30 la veille = le jour)',
    fichier: 'lib/heure-belge.js', de: '  const avecFuseau = /([zZ]|[+-]\\d{2}:?\\d{2})$/.test(brut) ? brut : `${brut}Z`', vers: '  const avecFuseau = brut' },
  { nom: '🔴 create-commande ne dit plus le commerce au controle du stock',
    fichier: 'app/api/stripe/checkout/create-commande/route.js', de: '      supabase, lignes, commercantId: commercant.id, dateCommande: date_commande, commercant,', vers: '      supabase, lignes, commercantId: commercant.id, dateCommande: date_commande,' },
  { nom: '🔴 create-commande renvoie les items sans drapeau',
    fichier: 'app/api/stripe/checkout/create-commande/route.js', de: '      const items = itemsDeReservation(verifStock)', vers: '      const items = Object.entries(verifStock.consoParArticle || {}).map(([article_id, quantite]) => ({ article_id, quantite }))' },
  { nom: '🔴 la migration de la prod refuse l invendu',
    fichier: 'migrations/MIGRATION_TEMPS3_DEUX_CIRCUITS.sql', de: "          IF (v_item->>'invendu') = 'true' THEN", vers: '          IF false THEN' },
  // La fiche
  { nom: '🔴 la fiche oublie le circuit du jour',
    fichier: FICHE, de: '  const circuitAffiche = circuitDuJour({ commercant, jour: jourDuPanier(), aujourdhui: aujourdhuiISO() })', vers: '  const circuitAffiche = null' },
  { nom: '🔴 la regle du jour de la fiche ignore les circuits',
    fichier: FICHE, de: '    let circuits = circuitsDeLArticle(article, commercant)', vers: '    let circuits = null' },
  { nom: '🔴 le sandwich epuise propose demain (jour meme seulement)',
    fichier: FICHE, de: "    if (circuitAffiche !== 'A' || article?.commande_active !== true || article.est_vitrine) return null", vers: "    if (circuitAffiche !== 'A' || article.est_vitrine) return null" },
  { nom: '🔴 le relais propose aujourd hui',
    fichier: FICHE, de: '    const jour = joursDuCalendrier().find(j => j > auj && !refusDuJour({ ...r, jour: j, aujourdhui: auj })) || null', vers: '    const jour = joursDuCalendrier().find(j => !refusDuJour({ ...r, jour: j, aujourdhui: auj })) || null' },
  { nom: '🔴 epuise ne dit plus qu il se commande un autre jour',
    fichier: FICHE, de: '              if (relais && onCommanderAutreJour) {', vers: '              if (false) {' },
  // Le stock qui baisse, partage entre tous les jours (Alex, 08/10)
  { nom: '🔴 le pot retombe dans un circuit (refuse samedi)',
    fichier: LIB, de: "  if (modeStockDe(article) === 'magasin') return null", vers: '' },
  { nom: '🔴 l ecran compte le pot par circuit',
    fichier: LIB, de: "  if (modeStockDe(article) === 'magasin') {", vers: '  if (false) {' },
  { nom: '🔴 serveur : les ventes d avant la saisie comptent encore',
    fichier: 'lib/lignes-commande.js', de: '      if (vendu === null || vendu < saisie) return', vers: '' },
  { nom: '🔴 serveur : un article a variantes bloque sur son stock d article',
    fichier: 'lib/lignes-commande.js', de: '      if (art?.gere_variantes === true) continue', vers: '' },
  { nom: '🔴 serveur : le pot se compte de nouveau jour par jour',
    fichier: 'lib/lignes-commande.js', de: "    if (modeStockDe(art) === 'magasin') {", vers: '    if (false) {' },
  { nom: '🔴 la migration compte le pot depuis toujours',
    fichier: 'migrations/MIGRATION_STOCK_PARTAGE.sql', de: "            AND (c.created_at AT TIME ZONE 'UTC') >= v_maj", vers: '' },
  { nom: '🔴 la fiche compte le pot au jour affiche',
    fichier: FICHE, de: "      if (modeStockDe(a) === 'magasin') map[a.id] = dejaCommandePourStock({ article: a, duJour, ventesMagasin })", vers: '' },
  { nom: '🔴 le tableau de bord montre le chiffre saisi, pas le reste',
    fichier: BORD, de: '              const st = Math.max(0, (a.stock_jour || 0) - venduDepuisSaisie)', vers: '              const st = a.stock_jour || 0' },
  // Le tableau de bord
  { nom: '🔴 le tableau de bord met tout dans A',
    fichier: BORD, de: "    const cible = info.circuit === 'A' ? map : mapB", vers: '    const cible = map' },
  { nom: '🔴 le formulaire enregistre un reglage impossible',
    fichier: BORD, de: '    const refusB = avecCircuits ? refusCircuits(form) : null', vers: '    const refusB = null' },
  { nom: '🔴 le comptoir du jour liste les articles sur commande seulement',
    fichier: BORD, de: "    return articles.filter(a => a.actif !== false && a.est_vitrine !== true && modeStockDe(a) === 'jour' && (!deuxCircuits || a.vente_jour !== false))", vers: "    return articles.filter(a => a.actif !== false && a.est_vitrine !== true && modeStockDe(a) === 'jour')" },
  { nom: '🔴 SELECT_ARTICLES oublie les circuits (tout autre jour refuse)',
    fichier: 'lib/lignes-commande.js', de: 'tva_taux_sur_place, delai_minutes, vente_jour, commande_active, stock_mode\'', vers: 'tva_taux_sur_place, delai_minutes, stock_mode\'' },
  { nom: '🔴 SELECT_ARTICLES oublie le mode (le pot refuse samedi)',
    fichier: 'lib/lignes-commande.js', de: 'tva_taux_sur_place, delai_minutes, vente_jour, commande_active, stock_mode\'', vers: 'tva_taux_sur_place, delai_minutes, vente_jour, commande_active\'' },
  { nom: '🔴 la copie oublie les circuits',
    fichier: 'lib/catalogue-copie.js', de: "  'vente_jour', 'commande_active', 'commande_max_jour',", vers: '' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer(BANC)
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log(`Banc vert au départ : ${BANC}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ Les fichiers peuvent être en CRLF : la cible suit la fin de ligne du fichier.
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const de = m.de.split('\n').join(eol)
  const vers = m.vers.split('\n').join(eol)
  if (!original.includes(de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(de, vers))
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = lancer(BANC).rouge
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
