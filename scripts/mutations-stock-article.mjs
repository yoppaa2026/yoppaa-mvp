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
    // ⚠️ Ancre reorientee le 07/10 : le jour passe (comptoir).
    fichier: FICHE, de: '    return etatStock({ article, entreeJour: entryDay, dejaCommande, jour: jourLocalISO(jourDateSelectionne) }).dispo', vers: '    return (article.stock_jour > 0) ? Math.max(0, article.stock_jour - dejaCommande) : Infinity' },
  // 🔴 LE COMPTOIR DU JOUR (07/10).
  { nom: '🔴 le comptoir ne plafonne plus rien a l ecran',
    fichier: 'lib/stock-article.js', de: '  if (comptoir !== null) return { actif: true, gere: true, brut: comptoir, dispo: Math.max(0, comptoir - deja) }', vers: '' },
  { nom: '🔴 un comptoir de mardi plafonne mercredi',
    fichier: 'lib/stock-article.js', de: '  if (!article || !jour || article.stock_comptoir_le !== jour) return null', vers: '  if (!article) return null' },
  { nom: '🔴 le comptoir se date du jour de la machine',
    fichier: 'app/dashboard/ConfigDashboard.js', de: 'stock_comptoir_le: jourBruxelles() }', vers: 'stock_comptoir_le: new Date().toISOString().slice(0, 10) }' },
  { nom: '🔴 le bouton du comptoir reste visible le soir',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '            {parJours && onSetComptoir && !effAuj.ferme && !congeAuj && !journeeFinie && (', vers: '            {parJours && onSetComptoir && !effAuj.ferme && !congeAuj && (' },
  { nom: '🔴 la grille affiche de nouveau le comptoir (« Mer 3 »)',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '    if (avecComptoir && jour === jourActuelKey && comptoirAuj !== null) {', vers: '    if (jour === jourActuelKey && comptoirAuj !== null) {' },
  { nom: '🔴 « Retirer le comptoir » disparait le soir',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '            {onSetComptoir && effAuj.comptoir && (', vers: '            {onSetComptoir && effAuj.comptoir && !journeeFinie && (' },
  { nom: '🔴 le formulaire ne dit plus que la grille le remplace',
    fichier: 'app/dashboard/ConfigDashboard.js', de: "                  {form.stock_mode === 'jour' && editId && (() => {", vers: "                  {false && (() => {" },
  { nom: '🔴 revenir au defaut efface aussi les jours fermes',
    fichier: 'app/dashboard/ConfigDashboard.js', de: "      .delete().eq('article_id', articleId).eq('actif', true)\n    if (error) { toast(`Les quantités", vers: "      .delete().eq('article_id', articleId)\n    if (error) { toast(`Les quantités" },
  { nom: '🔴 la journee ne finit jamais',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '    return f !== null && m !== null && m >= f', vers: '    return false' },
  { nom: '🔴 le reste saisi oublie le deja commande',
    // ⚠️ Ancre reorientee le 07/10 : le bloc a ete scinde (indentation).
    fichier: 'app/dashboard/ConfigDashboard.js', de: '                  onSetComptoir(a.id, reste + dejaCommande)', vers: '                  onSetComptoir(a.id, reste)' },
  { nom: '🔴 la carte promet « demain » sur un stock en magasin',
    fichier: FICHE, de: '  const prochain = epuiseAujourdhui && revientUnAutreJour(article) ? prochainJourDispo() : null', vers: '  const prochain = epuiseAujourdhui ? prochainJourDispo() : null' },
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
    fichier: BORD, de: "{afficheFerme ? '✕' : sansLimite ? '∞' : eff.dispo}", vers: "{afficheFerme ? '✕' : eff.dispo}" },
  { nom: '🔴 une prestation sans prix s enregistre',
    fichier: BORD, de: "    if (!formEstTable && String(form.prix ?? '').trim() === '') {", vers: '    if (false) {' },
  { nom: '🔴 le « Prix indicatif » revient au tableau de bord',
    fichier: BORD, de: "            const prixLabel = p.prix != null ? euros(p.prix) : 'Prix à indiquer'", vers: "            const prixLabel = p.prix != null ? euros(p.prix) : 'Prix sur demande'" },
  { nom: '🔴 la copie oublie le mode de stock',
    fichier: 'lib/catalogue-copie.js', de: "  'nom', 'description', 'prix', 'stock_jour', 'stock_mode', 'actif', 'categorie',", vers: "  'nom', 'description', 'prix', 'stock_jour', 'actif', 'categorie'," },
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
