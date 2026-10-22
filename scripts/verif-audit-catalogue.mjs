// BANC — L'AUDIT ARTICLES + PERSONNALISATION, SUITE (22/10, tableau d'Alex)
//
// Le bandeau « À corriger », les prix en lot (« Mettre à 12 € », « +0,50 € »,
// variantes comprises), « Enregistrer et personnaliser », la fiabilité des
// écritures et le confort. Les graves (R1 à R4) vivent dans `verif:lots-options`,
// `verif:stock-article` et `verif:copie`.
//
// ⚠️ LE BANC EXÉCUTE LES RÈGLES ET LIT LE CODE QUI LES BRANCHE.
//
//   npm run verif:audit-catalogue

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { articlesACorriger, titreACorriger } from '../lib/catalogue-a-corriger.js'

const RACINE = new URL('../', import.meta.url)
const code = (f) => sansProse(readFileSync(new URL(f, RACINE), 'utf8'))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. LE BANDEAU « À CORRIGER » ══════════════════════════════════════════
{
  const articles = [
    { id: 1, nom: 'Bralette', gere_variantes: true, stock_mode: 'magasin', actif: true },
    { id: 2, nom: 'Robe', gere_variantes: true, stock_mode: 'magasin', actif: true },
    { id: 3, nom: 'Body', gere_variantes: true, stock_mode: 'magasin', actif: true },
    { id: 4, nom: 'Bague', gere_variantes: true, stock_mode: 'illimite', actif: true },
    { id: 5, nom: 'Pizza', actif: true },
    { id: 6, nom: 'Masquée', gere_variantes: true, actif: false },
    { id: 7, nom: 'En vitrine', gere_variantes: true, est_vitrine: true, actif: true },
    { id: 8, nom: 'Jupe', gere_variantes: true, stock_mode: 'jour', actif: true },
    { id: 9, nom: 'Top', gere_variantes: true, stock_mode: 'magasin', actif: true },
  ]
  const variantesParArticle = {
    2: [{ actif: false, stock: 4 }],
    3: [{ actif: true, stock: 0 }, { actif: true, stock: 0 }],
    4: [{ actif: true, stock: 0 }],
    8: [{ actif: true, stock: 3 }],
    9: [{ actif: true, stock: 0 }, { actif: true, stock: 2 }],
  }
  const groupesParArticle = {
    5: [{ nom: 'Sauces', obligatoire: true, valeurs: [] }, { nom: 'Taille', obligatoire: true, valeurs: [{}, {}] }],
  }
  const liste = articlesACorriger({ articles, variantesParArticle, groupesParArticle })
  const par = Object.fromEntries(liste.map(x => [x.id, x]))
  v('🔴 des variantes sans aucune combinaison : signalé', /n’en a aucune/.test(par[1]?.raisons?.[0] || ''), JSON.stringify(par[1]))
  v('🔴 toutes les variantes éteintes : signalé', /toutes ses variantes sont éteintes/.test(par[2]?.raisons?.[0] || ''))
  v('🔴 toutes les variantes à 0 : signalé', /toutes ses variantes sont à 0/.test(par[3]?.raisons?.[0] || ''))
  v('« fabriqué à la demande » à 0 : rien à corriger', !par[4])
  v('🔴 un groupe obligatoire sans option : signalé, le bon groupe ne l’est pas',
    par[5]?.raisons?.length === 1 && /« Sauces » : obligatoire, mais sans option/.test(par[5].raisons[0]), JSON.stringify(par[5]))
  v('un article masqué ou en vitrine n’est jamais signalé', !par[6] && !par[7])
  v('🔴 l’ancien « par jour » sur des variantes : signalé, geste « modifier »', /par jour/.test(par[8]?.raisons?.[0] || '') && par[8].geste === 'modifier')
  v('une variante en stock suffit', !par[9])
  v('l’ordre de la liste suit le catalogue', liste.map(x => x.id).join() === '1,2,3,5,8', liste.map(x => x.id).join())
  v('le titre compte, au singulier comme au pluriel',
    titreACorriger(liste) === '5 articles ne se vendent pas comme prévu' && titreACorriger([{}]) === '1 article ne se vend pas comme prévu' && titreACorriger([]) === '')
}

// ═══ 2. LES PRIX EN LOT : « Mettre à 12 € », « +0,50 € », variantes (O4) ═══
{
  const L = await import('../lib/catalogue-lot.js')
  v('un nombre seul reste un pourcentage (la forme d’avant)', JSON.stringify(L.lirePrixLot(-10)) === '{"mode":"pourcent","n":-10}')
  v('« +0,50 » se lit 0,5 €, « 12,50 € » aussi', L.lirePrixLot({ mode: 'ecart', saisie: '+0,50' }).n === 0.5 && L.lirePrixLot({ mode: 'fixe', saisie: '12,50 €' }).n === 12.5)
  v('une saisie illisible ne vaut rien', Number.isNaN(L.lirePrixLot({ mode: 'fixe', saisie: '12abc' }).n))
  v('🔴 « Mettre à 12 € » : 12 €, quel que soit l’ancien prix', L.nouveauPrix(9.9, { mode: 'fixe', saisie: '12' }) === 12 && L.nouveauPrix(null, { mode: 'fixe', saisie: '12' }) === 12)
  v('🔴 « +0,50 € » : au centime, sans dérive', L.nouveauPrix(9.4, { mode: 'ecart', saisie: '0,5' }) === 9.9 && L.nouveauPrix(0.1, { mode: 'ecart', saisie: '0,2' }) === 0.3)
  v('« -1 € » baisse', L.nouveauPrix(5, { mode: 'ecart', saisie: '-1' }) === 4)
  v('le pourcentage ne change pas', L.nouveauPrix(10, { mode: 'pourcent', saisie: '-10' }) === 9 && L.nouveauPrix(10, 10) === 11)
  v('🔴 un prix fixe à 0 est refusé', /Indique le nouveau prix/.test(L.refusDAjustement([{ prix: 5 }], { mode: 'fixe', saisie: '0' }) || ''))
  v('🔴 un montant nul est refusé', /Indique un montant/.test(L.refusDAjustement([{ prix: 5 }], { mode: 'ecart', saisie: '0' }) || ''))
  v('🔴 « -6 € » sur un article à 5 € est refusé', /tomber un prix à 0 €/.test(L.refusDAjustement([{ prix: 5 }], { mode: 'ecart', saisie: '-6' }) || ''))
  v('🔴 et sur le prix propre d’une variante aussi', /tomber un prix à 0 €/.test(L.refusDAjustement([{ prix: 20 }], { mode: 'ecart', saisie: '-6' }, [5]) || ''))
  v('un prix fixe se pose aussi sur un article sans prix', L.refusDAjustement([{ prix: null }], { mode: 'fixe', saisie: '8' }) === null)
  v('un montant valable passe', L.refusDAjustement([{ prix: 5 }], { mode: 'ecart', saisie: '+0,50' }) === null)
  const vises = [{ id: 1, prix: 30 }, { id: 2, prix: 40 }]
  const variantesParArticle = { 1: [{ id: 'a', prix: null }, { id: 'b', prix: 35 }], 2: [{ id: 'c', prix: '45' }] }
  v('🔴 O4 : -20 % suit les prix propres des variantes (et seulement eux)',
    JSON.stringify(L.prixDesVariantesDuLot({ articles: vises, variantesParArticle, valeur: { mode: 'pourcent', saisie: '-20' } })) === '[{"id":"b","article_id":1,"prix":28},{"id":"c","article_id":2,"prix":36}]')
  v('🔴 O4 : « +1 € » aussi', L.prixDesVariantesDuLot({ articles: vises, variantesParArticle, valeur: { mode: 'ecart', saisie: '1' } }).map(x => x.prix).join() === '36,46')
  v('🔴 un prix fixe ne touche pas les prix propres (dit à part)',
    L.prixDesVariantesDuLot({ articles: vises, variantesParArticle, valeur: { mode: 'fixe', saisie: '12' } }).length === 0 && L.variantesAPrixPropre({ articles: vises, variantesParArticle }) === 2)
  const fixe = L.patchsDuLot({ action: 'prix', articles: vises, valeur: { mode: 'fixe', saisie: '30' } })
  v('🔴 « Mettre à 30 € » n’écrit que ce qui change', JSON.stringify(fixe) === '[{"id":2,"patch":{"prix":30}}]', JSON.stringify(fixe))
  const r1 = L.resumeDuLot({ action: 'prix', patchs: [{ id: 1 }], coches: 1, valeur: { mode: 'fixe', saisie: '12' }, variantes: { changees: 0, gardees: 2 } })
  v('🔴 le résumé dit le prix fixe et les variantes qui gardent le leur, au singulier',
    r1 === 'Le prix de 1 article passera à 12,00 €. 2 variantes gardent leur propre prix. Les anciens prix ne sont pas conservés.', r1)
  const r2 = L.resumeDuLot({ action: 'prix', patchs: [{ id: 1 }, { id: 2 }], coches: 2, valeur: { mode: 'ecart', saisie: '-0,5' }, variantes: { changees: 1, gardees: 0 } })
  v('le résumé dit le montant, au pluriel, et la variante qui suit',
    r2 === 'Les prix de 2 articles baisseront de 0,50 €. 1 variante à son propre prix suit aussi. Les anciens prix ne sont pas conservés.', r2)
  v('le pourcentage s’accorde aussi (« Le prix de 1 article baissera »)',
    L.resumeDuLot({ action: 'prix', patchs: [{ id: 1 }], coches: 1, valeur: -15 }) === 'Le prix de 1 article baissera de 15 %. Les anciens prix ne sont pas conservés.')
  // O5 : « stock qui baisse » en lot éteint « sur commande ».
  const bocal = { id: 9, nom: 'Bocal', stock_mode: 'jour', stock_jour: 5, vente_jour: true, commande_active: true, delai_minutes: 1440 }
  const o5 = L.patchsDuLot({ action: 'stock', articles: [bocal], valeur: { mode: 'magasin', quantite: '10' }, maintenant: new Date('2026-10-22T10:00:00Z') })
  v('🔴 O5 : le stock qui baisse éteint « sur commande » (sinon le formulaire refusait tout)',
    o5.length === 1 && o5[0].patch.commande_active === false && o5[0].patch.delai_minutes === 0 && o5[0].patch.stock_mode === 'magasin', JSON.stringify(o5))
  v('O5 : hors alimentaire, rien ne change de ce côté', L.patchsDuLot({ action: 'stock', articles: [bocal], valeur: { mode: 'magasin', quantite: '10' }, deuxCircuits: false })[0].patch.commande_active === undefined)
  v('O5 : un article sur commande SEULEMENT le reste', L.patchsDuLot({ action: 'stock', articles: [{ ...bocal, vente_jour: false }], valeur: { mode: 'magasin', quantite: '10' } })[0].patch.commande_active === undefined)
  v('🔴 O5 : le résumé le dit', /« Sur commande » s’éteint pour 1 article/.test(L.resumeDuLot({ action: 'stock', patchs: o5, coches: 1, valeur: { mode: 'magasin', quantite: '10' } })))
  v('l’accord : « 1 article passera »', /^1 article passera à 10 en magasin/.test(L.resumeDuLot({ action: 'stock', patchs: [{ id: 1, patch: {} }], coches: 1, valeur: { mode: 'magasin', quantite: '10' } })))
  // J10 : une catégorie changée range l'article à la fin, dans l'ordre du lot.
  const catalogue = [{ id: 1, categorie: 'Vins', ordre: 1 }, { id: 2, categorie: 'Vins', ordre: 4 }, { id: 3, categorie: 'Bières', ordre: 9 }, { id: 4, categorie: 'Bières', ordre: 2 }]
  const j10 = L.patchsDuLot({ action: 'categorie', articles: [catalogue[2], catalogue[3]], valeur: 'Vins', catalogue })
  v('🔴 J10 : les articles arrivent en fin de leur nouvelle catégorie', JSON.stringify(j10.map(p => p.patch)) === '[{"categorie":"Vins","ordre":5},{"categorie":"Vins","ordre":6}]', JSON.stringify(j10))
  const avecUnDejaLa = [...catalogue, { id: 5, categorie: 'Vins', ordre: 10 }]
  const j10b = L.patchsDuLot({ action: 'categorie', articles: [avecUnDejaLa[2], avecUnDejaLa[4]], valeur: 'Vins', catalogue: avecUnDejaLa })
  v('🔴 J10 : un article du lot déjà dans la catégorie garde sa place, le nouveau vient après lui',
    JSON.stringify(j10b) === '[{"id":3,"patch":{"categorie":"Vins","ordre":11}}]', JSON.stringify(j10b))
  v('J10 : sans le catalogue, l’ordre ne bouge pas', L.patchsDuLot({ action: 'categorie', articles: [catalogue[2]], valeur: 'Vins' })[0].patch.ordre === undefined)
}

// ═══ 3. LE BRANCHEMENT À L'ÉCRAN ═════════════════════════════════════════════
{
  const bord = code('app/dashboard/ConfigDashboard.js')
  const css = readFileSync(new URL('app/globals.css', RACINE), 'utf8')
  // Le bandeau et « Enregistrer et personnaliser ».
  v('🔴 le bandeau « À corriger » lit la règle, et son geste ouvre l’article',
    /const aCorriger = articlesACorriger\(\{ articles, variantesParArticle, groupesParArticle \}\)/.test(bord)
    && /onClick=\{\(\) => \(x\.geste === 'modifier' && a \? openEdit\(a\) : ouvrirPersonnalisation\(x\.id\)\)\}/.test(bord))
  v('🔴 « Enregistrer et personnaliser » : au choix, et la Personnalisation s’ouvre sur l’article',
    /onClick=\{\(\) => saveArticle\(\{ personnaliser: true \}\)\}/.test(bord) && /onClick=\{\(\) => saveArticle\(\)\}/.test(bord)
    && (bord.match(/if \(personnaliser\) ouvrirPersonnalisation\(cree\.id\)/g) || []).length === 2
    && /setSubTab\('personnalisation'\)\s*setPanneauxOuverts\(p => \(\{ \.\.\.p, \[id\]: true \}\)\)/.test(bord)
    && /<details key=\{a\.id\} id=\{`perso-\$\{a\.id\}`\} open=\{!!panneauxOuverts\[a\.id\]\}/.test(bord))
  // Les saisies ne se perdent plus (O12).
  v('🔴 O12 : quitter un formulaire modifié se confirme, partout (Annuler, autre article, + Article, catégories, menu lu)',
    /if \(JSON\.stringify\(form\) === formDepart\.current && photosEnAttente\.length === 0\) return true/.test(bord)
    && /if \(!okQuitterFormulaire\) return false/.test(bord)
    && /async function openNew\(\) \{\s*if \(!await peutQuitterFormulaire\(\)\) return/.test(bord)
    && /async function openEdit\(a\) \{\s*if \(showForm && String\(editId\) === String\(a\.id\)\) return\s*if \(!await peutQuitterFormulaire\(\)\) return/.test(bord)
    && /onClick=\{fermerFormulaire\}>Annuler<\/button>/.test(bord)
    && (bord.match(/onClick=\{async \(\) => \{ if \(!await peutQuitterFormulaire\(\)\) return;/g) || []).length === 2)
  v('🔴 O12 : les photos jamais rattachées quittent le stockage', /const chemins = photosEnAttente\.map\(p => p\.chemin\)\.filter\(Boolean\)\s*if \(chemins\.length > 0\) supabase\.storage\.from\('logos'\)\.remove\(chemins\)/.test(bord))
  v('O12 : le formulaire ouvert sert de référence', (bord.match(/poserFormulaire\(\{ nom: /g) || []).length === 2)
  // Les écritures relues (O6).
  v('🔴 O6 : afficher / masquer est relu', /\.update\(\{ actif: !a\.actif \}\)\.eq\('id', a\.id\)\.select\('id'\)\s*if \(error \|\| \(data\?\.length \|\| 0\) !== 1\) toast\(/.test(bord))
  v('🔴 O6 : le lot compte les lignes écrites, prix des variantes compris',
    /else rates \+= ids\.length - \(ecrits\?\.length \|\| 0\)/.test(bord) && /\.from\('article_variantes'\)\.update\(\{ prix \}\)\.in\('id', ids\)\.select\('id'\)/.test(bord))
  v('🔴 O6 : la quantité d’un jour, repli compris, est relue ; « tous les jours » dit les ratés',
    /let ecrit = !error && \(data\?\.length \|\| 0\) === 1/.test(bord) && /ecrit = !errIns && \(inseree\?\.length \|\| 0\) === 1/.test(bord)
    && /const rates = resultats\.filter\(r => !r\)\.length/.test(bord))
  v('🔴 O6 : stock en rayon, comptoir (carte et page) et liste des catégories relus',
    /const \{ data, error \} = await supabase\.from\('articles'\)\.update\(maj\)\.eq\('id', id\)\.select\('id'\)\s*if \(error \|\| \(data\?\.length \|\| 0\) !== 1\) \{ toast\(`Le stock n’a pas été enregistré/.test(bord)
    && /return \{ id: a\.id, maj, error: error \|\| \(\(data\?\.length \|\| 0\) !== 1 \? \{ message: 'modification refusée' \} : null\) \}/.test(bord)
    && /\.update\(\{ ordre_categories: liste \}\)\.eq\('id', commercantId\)\.select\('id'\)/.test(bord)
    && /\.select\('id'\)\s*const error = errEcriture \|\| \(\(data\?\.length \|\| 0\) !== 1/.test(code('app/dashboard/OrdreCategories.js')))
  v('🔴 O6 : l’article enregistré est relu (zéro ligne = refusé)', /if \(!cree\?\.id\) \{ setSaving\(false\); toast\('L’article n’a pas été enregistré/.test(bord))
  // Prix en lot, à l'écran.
  v('🔴 prix en lot : les trois façons, et les variantes dans l’aperçu comme à l’écriture',
    /MODES_PRIX_LOT\.map\(m => \(/.test(bord) && /action === 'prix' \? \{ mode: lotPrixMode, saisie: lotValeur \}/.test(bord)
    && (bord.match(/prixDesVariantesDuLot\(\{ articles: vises, variantesParArticle, valeur \}\)/g) || []).length === 2
    && /\.select\('id, article_id, axe1_valeur, axe2_valeur, stock, actif, ordre, prix'\)/.test(bord))
  // Mobile, aides, mots (O10, O13, O14, J3 à J8, J10, J11).
  v('🟠 O13 : sous-onglets et boutons des groupes passent à la ligne, « Dupliquer » se réduit à l’icône',
    /display: 'flex', flexWrap: 'wrap', gap: 4, background: '#fff', padding: 4, borderRadius: 12/.test(bord)
    && /\n\.libelle-large \{\s*display: none;\s*\}\s*@media \(min-width: 1024px\) \{\s*\.libelle-large \{\s*display: inline;/.test(css))
  v('🟠 O14 : l’aide des photos dit le 4:5 et les photos coupées', /recadrée automatiquement en portrait \(4:5\)/.test(bord) && !/Format idéal carré/.test(bord) && /const photosSurLaFiche = commercant\?\.photos_catalogue_actif !== false/.test(bord))
  v('🟠 O10 : « coche les jours » seulement là où la carte a ses jours',
    /const aideJoursDeVente = form\.stock_mode !== 'magasin' && !form\.gere_variantes/.test(bord) && (bord.match(/\$\{aideJoursDeVente\}/g) || []).length === 2)
  v('🟡 J4 : des exemples de boutique dans « Quand peut-on le commander ? »', /une retouche, une gravure, une pièce à faire venir/.test(bord))
  v('🟡 J5 : « Sur ta fiche » / « Masqué » sur la carte', /\{a\.actif \? 'Sur ta fiche' : 'Masqué'\}/.test(bord))
  v('🟡 J6 : une boutique n’a pas de « comptoir »', /const motsBoutique = estDetail \|\| estVitrine/.test(bord) && /'Il en reste aujourd’hui'/.test(bord))
  v('🟡 J8 : la TVA sur place du lot suit le formulaire (`estAlimentaire`)', !/commercant\?\.categorie === 'alimentaire'/.test(bord))
  v('🟡 J10 : une catégorie parente montre ses sous-catégories, et les compte',
    /articles\.filter\(a => dansLaCategorie\(a, catActive\)\)/.test(bord) && /, et \$\{dansSousCats\} dans ses sous-catégories/.test(bord))
  v('🟠 O11 : retirer une photo de la galerie se confirme, et la suppression est relue',
    /if \(!okSuppressionPhoto\) return\s*const \{ data, error \} = await supabase\.from\('article_photos'\)\.delete\(\)\.eq\('id', id\)\.select\('id'\)/.test(bord))
  v('🟡 J11 : plus aucun `window.prompt` dans le tableau de bord des articles', !/window\.prompt\(/.test(bord) && /<SaisieRapide key=\{saisieCarte\.quoi\}/.test(bord))
}

console.log(`\nAudit du catalogue, suite : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
