// HARNAIS DE MUTATION — L'AUDIT ARTICLES + PERSONNALISATION, SUITE (22/10)
//
// Chaque mutation casse UNE partie de la deuxième partie du lot (bandeau
// « À corriger », prix en lot, « Enregistrer et personnaliser », écritures
// relues, saisies protégées, confort) ; `verif:audit-catalogue` doit rougir.
// Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-audit-catalogue.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:audit-catalogue'
const CORRIGER = 'lib/catalogue-a-corriger.js'
const LOT = 'lib/catalogue-lot.js'
const BORD = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── le bandeau « À corriger » ─────────────────────────────────────────
  { nom: '🔴 un article masqué est signalé', fichier: CORRIGER,
    de: '    if (!a || a.actif === false || a.est_vitrine === true) continue', vers: '    if (!a) continue' },
  { nom: '🔴 des variantes absentes ne sont plus signalées', fichier: CORRIGER,
    de: '      if (actives.length === 0) {', vers: '      if (false) {' },
  { nom: '🔴 toutes les variantes à 0 ne sont plus signalées', fichier: CORRIGER,
    de: '      } else if (!variantesSansLimite(a) && actives.every(v => !(Number(v.stock) > 0))) {', vers: '      } else if (false) {' },
  { nom: '⚠️ « à la demande » à 0 est signalé à tort', fichier: CORRIGER,
    de: '      } else if (!variantesSansLimite(a) && actives.every(v => !(Number(v.stock) > 0))) {', vers: '      } else if (actives.every(v => !(Number(v.stock) > 0))) {' },
  { nom: '🔴 l ancien « par jour » sur des variantes n est plus signalé', fichier: CORRIGER,
    de: "      if (modeStockDe(a) === 'jour') {", vers: '      if (false) {' },
  { nom: '🔴 un groupe obligatoire vide n est plus signalé', fichier: CORRIGER,
    de: '      if (p) raisons.push(`« ${g.nom} » : ${p.charAt(0).toLowerCase()}${p.slice(1)}`)', vers: '' },
  { nom: '🔴 un ancien stock général sur des variantes n est plus signalé', fichier: CORRIGER,
    de: "      if (modeStockDe(a) !== 'magasin' && (Number(a.stock_jour) > 0 || (a.stock_comptoir !== null && a.stock_comptoir !== undefined))) {", vers: '      if (false) {' },
  { nom: '🔴 le serveur plafonne de nouveau un article à variantes par son stock général', fichier: 'lib/lignes-commande.js',
    de: '    if (art?.gere_variantes === true) continue // pas de stock général', vers: '    // (mutant) plus de saut pour les variantes' },
  { nom: '🔴 la fiche d un article à variantes garde l ancien stock général', fichier: BORD,
    de: '      ? { stock_mode: formStock.stock_mode, stock_jour: 0, stock_comptoir: null, stock_comptoir_le: null }', vers: '      ? { stock_mode: formStock.stock_mode, stock_jour: avant ? Math.max(0, Number(avant.stock_jour) || 0) : 0 }' },
  { nom: '🔴 activer les variantes garde l ancien stock général', fichier: BORD,
    de: '    if (v) Object.assign(patch, { stock_jour: 0, stock_comptoir: null, stock_comptoir_le: null })', vers: '' },
  // ─── les prix en lot ───────────────────────────────────────────────────
  { nom: '🔴 « Mettre à » devient un pourcentage', fichier: LOT,
    de: "    const mode = ['fixe', 'ecart'].includes(valeur.mode) ? valeur.mode : 'pourcent'", vers: "    const mode = 'pourcent'" },
  { nom: '🔴 « +0,50 » perd son signe plus et devient illisible', fichier: LOT,
    de: "    const s = String(valeur.saisie ?? '').trim().replace(',', '.').replace(/^\\+/, '').replace(/\\s*€$/, '')", vers: "    const s = String(valeur.saisie ?? '').trim().replace(',', '.')" },
  { nom: '🔴 un prix fixe à 0 passe', fichier: LOT,
    de: "    if (!Number.isFinite(n) || n <= 0) return 'Indique le nouveau prix, comme 12 ou 12,50.'", vers: '' },
  { nom: '🔴 un montant nul passe', fichier: LOT,
    de: "  if (mode === 'ecart' && (!Number.isFinite(n) || n === 0)) return 'Indique un montant, comme +0,50 ou -1.'", vers: '' },
  { nom: '🔴 les prix des variantes ne sont plus contrôlés', fichier: LOT,
    de: '  const tropBas = [...liste.map(a => a?.prix), ...(Array.isArray(prixVariantes) ? prixVariantes : [])].some(prix => {', vers: '  const tropBas = [...liste.map(a => a?.prix)].some(prix => {' },
  { nom: '🔴 le montant se calcule en euros (dérive)', fichier: LOT,
    de: '  return (centimes(base) + centimes(n)) / 100', vers: '  return base + n' },
  { nom: '🔴 O4 : les variantes ne suivent plus le pourcentage', fichier: LOT,
    de: '      const p = nouveauPrix(v.prix, valeur)', vers: '      const p = null' },
  { nom: '🔴 un prix fixe écrase les prix propres des variantes', fichier: LOT,
    de: "  if (mode === 'fixe') return []", vers: '' },
  { nom: '🔴 le lot du prix retombe sur le seul pourcentage', fichier: LOT,
    de: '      const nouveau = nouveauPrix(a.prix, valeur)', vers: '      const nouveau = prixAjuste(a.prix, valeur)' },
  { nom: '⚠️ le résumé du prix fixe ne dit plus les variantes gardées', fichier: LOT,
    de: "    : vg > 0 ? ` ${vg === 1 ? '1 variante garde son propre prix' : `${vg} variantes gardent leur propre prix`}.` : ''", vers: "    : ''" },
  { nom: '⚠️ l accord du verbe se perd', fichier: LOT,
    de: "  const sujet = n === 1 ? 'Le prix de 1 article' : `Les prix de ${n} articles`", vers: '  const sujet = `Le prix de ${quoi}`' },
  // ─── O5 et J10 ─────────────────────────────────────────────────────────
  { nom: '🔴 O5 : le stock qui baisse laisse « sur commande » allumé', fichier: LOT,
    de: "      const coupeB = deuxCircuits && champs.stock_mode === 'magasin' && a.commande_active === true && a.vente_jour !== false", vers: '      const coupeB = false' },
  { nom: '🔴 O5 : il coupe aussi un article sur commande SEULEMENT', fichier: LOT,
    de: "      const coupeB = deuxCircuits && champs.stock_mode === 'magasin' && a.commande_active === true && a.vente_jour !== false", vers: "      const coupeB = deuxCircuits && champs.stock_mode === 'magasin' && a.commande_active === true" },
  { nom: '⚠️ O5 : le résumé ne le dit plus', fichier: LOT,
    de: '    const coupes = (Array.isArray(patchs) ? patchs : []).filter(p => p?.patch?.commande_active === false).length', vers: '    const coupes = 0' },
  { nom: '🔴 J10 : la catégorie changée garde l ancien rang', fichier: LOT,
    de: '      if (Array.isArray(catalogue)) {', vers: '      if (false) {' },
  // (22/10) Remplacée : la règle comptait mal (un article du lot déjà dans la
  // catégorie était ignoré, les nouveaux passaient avant lui). Le mutant vise
  // maintenant le bon défaut.
  { nom: '🔴 J10 : un article déjà dans la catégorie ne compte plus', fichier: LOT,
    de: '            .filter(x => x && (x.categorie || null) === cible)', vers: '            .filter(x => x && (x.categorie || null) === cible && false)' },
  // ─── l'écran ───────────────────────────────────────────────────────────
  { nom: '🔴 le bandeau ouvre toujours la fiche, jamais la personnalisation', fichier: BORD,
    de: "onClick={() => (x.geste === 'modifier' && a ? openEdit(a) : ouvrirPersonnalisation(x.id))}>", vers: 'onClick={() => a && openEdit(a)}>' },
  { nom: '🔴 « Enregistrer et personnaliser » enregistre sans ouvrir la suite', fichier: BORD,
    de: "onClick={() => saveArticle({ personnaliser: true })}", vers: 'onClick={() => saveArticle()}' },
  { nom: '🔴 O12 : quitter un formulaire modifié ne demande plus rien', fichier: BORD,
    de: '    if (!okQuitterFormulaire) return false', vers: '' },
  { nom: '🔴 O12 : « Annuler » ferme sans demander', fichier: BORD,
    de: 'onClick={fermerFormulaire}>Annuler</button>', vers: 'onClick={() => setShowForm(false)}>Annuler</button>' },
  { nom: '🔴 O12 : un autre article remplace le formulaire en cours', fichier: BORD,
    de: '    if (showForm && String(editId) === String(a.id)) return', vers: '' },
  { nom: '⚠️ O12 : les photos abandonnées restent dans le stockage', fichier: BORD,
    de: "    if (chemins.length > 0) supabase.storage.from('logos').remove(chemins).catch(() => {})", vers: '' },
  { nom: '🔴 O6 : afficher / masquer n est plus relu', fichier: BORD,
    de: "    const { data, error } = await supabase.from('articles').update({ actif: !a.actif }).eq('id', a.id).select('id')", vers: "    const { data, error } = await supabase.from('articles').update({ actif: !a.actif }).eq('id', a.id)" },
  { nom: '🔴 O6 : le lot ne compte plus les lignes écrites', fichier: BORD,
    de: '      else rates += ids.length - (ecrits?.length || 0)', vers: '' },
  { nom: '🔴 O6 : « tous les jours » annonce un succès faux', fichier: BORD,
    de: '    const rates = resultats.filter(r => !r).length', vers: '    const rates = 0' },
  { nom: '🔴 O6 : le comptoir de la page n est plus relu', fichier: BORD,
    de: "      return { id: a.id, maj, error: error || ((data?.length || 0) !== 1 ? { message: 'modification refusée' } : null) }", vers: '      return { id: a.id, maj, error }' },
  { nom: '🔴 O4 : l écran oublie les prix des variantes', fichier: BORD,
    de: "    const prixVar = lotAction === 'prix' ? prixDesVariantesDuLot({ articles: vises, variantesParArticle, valeur }) : []", vers: '    const prixVar = []' },
  { nom: '🟠 O10 : « coche les jours » revient en stock magasin', fichier: BORD,
    de: "    const aideJoursDeVente = form.stock_mode !== 'magasin' && !form.gere_variantes", vers: '    const aideJoursDeVente = true' },
  { nom: '🟡 J10 : la parente ne montre plus ses sous-catégories', fichier: BORD,
    de: "  const articlesFiltres = catActive === 'Tous' ? articles : articles.filter(a => dansLaCategorie(a, catActive))", vers: "  const articlesFiltres = catActive === 'Tous' ? articles : articles.filter(a => a.categorie === catActive)" },
  { nom: '🟠 O11 : la photo de galerie part sans confirmer', fichier: BORD,
    de: '    if (!okSuppressionPhoto) return', vers: '' },
  // ─── (22/10) les grilles : créer, modifier partout, retirer ──────────────
  { nom: '🔴 une valeur tapée deux fois passe', fichier: 'lib/variantes-grille.js',
    de: '    if (doublon) return { ok: false, error: `« ${doublon} » est tapé deux fois dans ${nom}.` }', vers: '' },
  { nom: '🔴 un 2e axe sans nom passe', fichier: 'lib/variantes-grille.js',
    de: "  if (v2.length > 0 && !cle(axe2Nom)) return { ok: false, error: 'Donne un nom au 2e axe (par exemple « Couleur »).' }", vers: '' },
  { nom: '🔴 ajouter une valeur ne crée plus les combinaisons des articles', fichier: 'lib/variantes-grille.js',
    de: '      plan.aCreer.push(...r.aCreer)', vers: '' },
  { nom: '🔴 la première couleur ne convertit plus (stock perdu)', fichier: 'lib/variantes-grille.js',
    de: '      plan.aConvertir.ids.push(...r.aConvertir)', vers: '' },
  { nom: '🔴 renommer recrée au lieu de renommer', fichier: 'lib/variantes-grille.js',
    de: "    return { ok: true, ...vide, axes: { [colAxe]: r.liste }, renommer: { col: axe === 1 ? 'axe1_valeur' : 'axe2_valeur', de: op.valeur, vers: r.nom } }", vers: '    return { ok: true, ...vide, axes: { [colAxe]: r.liste } }' },
  { nom: '🔴 ranger n ordonne plus les combinaisons', fichier: 'lib/variantes-grille.js',
    de: '    return { ok: true, ...vide, axes: { [colAxe]: apres }, ordres: ids.flatMap(id => ordreDesVariantes(varsDe(id), n1, n2)) }', vers: '    return { ok: true, ...vide, axes: { [colAxe]: apres } }' },
  { nom: '🔴 retirer une valeur laisse ses combinaisons', fichier: 'lib/variantes-grille.js',
    de: '      plan.aSupprimer.push(...r.aSupprimer)', vers: '' },
  { nom: '⚠️ le stock qui part n est plus compté', fichier: 'lib/variantes-grille.js',
    de: '      plan.stockRetire += vars.filter(x => r.aSupprimer.includes(x.id)).reduce((s, x) => s + Math.max(0, Number(x.stock) || 0), 0)', vers: '' },
  { nom: '🔴 la dernière taille se retire et laisse une grille vide', fichier: 'lib/variantes-grille.js',
    de: "    if (axe === 1 && a1.length === 1) return { ok: false, error: 'C’est la dernière valeur : pour enlever la grille, utilise « Retirer de… ».' }", vers: '' },
  { nom: '🔴 retirer une grille laisse l article sur la fiche', fichier: 'lib/variantes-grille.js',
    // REPOINTÉE LE 23/10 : l'étiquette (`grille_nom`) part aussi avec la grille.
    de: 'export const RETRAIT_DE_GRILLE = Object.freeze({ gere_variantes: false, axe1_valeurs: [], axe2_nom: null, axe2_valeurs: [], actif: false, grille_nom: null })', vers: 'export const RETRAIT_DE_GRILLE = Object.freeze({ gere_variantes: false, axe1_valeurs: [], axe2_nom: null, axe2_valeurs: [], grille_nom: null })' },
  { nom: '🔴 « Nouvelle grille » pose sans article coché', fichier: BORD,
    de: "    if (cibles.length === 0) { toast('Coche au moins un article : une grille vit sur les articles qui la portent.', 'error'); return }", vers: '' },
  { nom: '🔴 retirer une valeur partout ne se confirme plus', fichier: BORD,
    de: '      if (!okRetraitGrille) return', vers: '' },
  { nom: '🔴 « Retirer de… » ne se confirme plus', fichier: BORD,
    de: '    if (!okRetirerGrille) return', vers: '' },
  { nom: '🔴 les axes modifiés ne sont plus relus', fichier: BORD,
    de: '    if (errArts || (arts?.length || 0) !== ids.length) return false', vers: '' },
  { nom: '🟡 J5 : la carte redit « Actif »', fichier: BORD,
    de: "{a.actif ? 'Sur ta fiche' : 'Masqué'}</span>", vers: "{a.actif ? 'Actif' : 'Inactif'}</span>" },
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
