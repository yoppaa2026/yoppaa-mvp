// BANC : LE STOCK EN TROIS CHOIX ET LA VITRINE AU PRIX FERME (30/09).
//
// Décisions d'Alex du 30/09 : un article se vend sans limite, par jour ou en
// magasin ; il peut être montré sans être vendu en ligne (« en vitrine »), pour
// tous les métiers ; et le prix est toujours ferme, services compris.
//
// Ce banc EXÉCUTE la règle (`lib/stock-article.js`) sur les cas qui ont coûté
// cher, puis vise les endroits qui la lisent : la fiche (carte et panier, qui
// calculaient chacun leur stock), le tableau de bord (ce qu'il écrit), la
// fiche des rendez-vous et la carte du QR de table (plus de « dès »).
//
//   npm run verif:stock-article

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  MODES_STOCK, modeStockDe, modeStockParDefaut, refusQuantite, champsStock, etatStock,
  revientUnAutreJour, mentionVitrine, choixDeVente, CHOIX_VISIBILITE,
} from '../lib/stock-article.js'
import { CHAMPS_COPIES } from '../lib/catalogue-copie.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))

// ═══ 1) LE MODE ═════════════════════════════════════════════════════════════
{
  v('trois choix, dans l’ordre', MODES_STOCK.join(',') === 'illimite,jour,magasin')
  v('🔴 une valeur inconnue se lit « par jour » (le comportement d’avant)',
    modeStockDe({ stock_mode: 'manuel' }) === 'jour' && modeStockDe({}) === 'jour' && modeStockDe(null) === 'jour')
  v('les trois valeurs se lisent telles quelles', MODES_STOCK.every(m => modeStockDe({ stock_mode: m }) === m))
  v('🔴 une boutique compte un vrai stock', modeStockParDefaut({ categorie: 'detail' }) === 'magasin')
  v('un service qui vend des produits aussi', modeStockParDefaut({ categorie: 'vitrine', type: 'Coiffeur' }) === 'magasin')
  v('🔴 une pizzeria prépare à la commande', modeStockParDefaut({ categorie: 'alimentaire', type: 'Pizzeria' }) === 'illimite')
  v('une boulangerie compte par jour', modeStockParDefaut({ categorie: 'alimentaire', type: 'Boulangerie' }) === 'jour')
}

// ═══ 2) CE QUE LE COMMERÇANT SAISIT ═════════════════════════════════════════
{
  v('sans limite : aucune quantité demandée', refusQuantite('illimite', '') === null)
  v('🔴 par jour : une quantité est demandée', refusQuantite('jour', '') !== null)
  v('🔴 par jour : 0 est refusé (le serveur le lirait « sans limite »)', refusQuantite('jour', '0') !== null)
  v('par jour : 30 passe', refusQuantite('jour', '30') === null)
  v('🔴 en magasin : une quantité est demandée', refusQuantite('magasin', '') !== null)
  v('🔴 en magasin : 0 passe (épuisé)', refusQuantite('magasin', '0') === null)
  v('une quantité négative ou décimale est refusée', refusQuantite('magasin', '-2') !== null && refusQuantite('jour', '2.5') !== null)
}

// ═══ 3) CE QUE LE TABLEAU DE BORD ÉCRIT ═════════════════════════════════════
{
  const MAINTENANT = new Date('2026-09-30T15:00:00Z')
  const illimite = champsStock({ mode: 'illimite', saisie: '999', maintenant: MAINTENANT })
  v('🔴 sans limite écrit 0, que le serveur d’aujourd’hui lit « sans limite »',
    illimite.stock_mode === 'illimite' && illimite.stock_jour === 0, JSON.stringify(illimite))
  const jour = champsStock({ mode: 'jour', saisie: '30', maintenant: MAINTENANT })
  v('par jour écrit sa quantité, sans toucher la date', jour.stock_jour === 30 && !('stock_maj_le' in jour))
  const neuf = champsStock({ mode: 'magasin', saisie: '3', maintenant: MAINTENANT })
  v('🔴 un nouveau stock en magasin repart de maintenant',
    neuf.stock_jour === 3 && neuf.stock_maj_le === MAINTENANT.toISOString(), JSON.stringify(neuf))
  const inchange = champsStock({ mode: 'magasin', saisie: '3', avant: { stock_mode: 'magasin', stock_jour: 3 }, maintenant: MAINTENANT })
  v('🔴 enregistrer une description ne remet PAS les ventes à zéro', !('stock_maj_le' in inchange), JSON.stringify(inchange))
  const change = champsStock({ mode: 'magasin', saisie: '5', avant: { stock_mode: 'magasin', stock_jour: 3 }, maintenant: MAINTENANT })
  v('un autre chiffre repart de maintenant', change.stock_maj_le === MAINTENANT.toISOString())
  const bascule = champsStock({ mode: 'magasin', saisie: '3', avant: { stock_mode: 'jour', stock_jour: 3 }, maintenant: MAINTENANT })
  v('passer en magasin repart de maintenant', bascule.stock_maj_le === MAINTENANT.toISOString())
  v('un mode inconnu s’écrit « par jour »', champsStock({ mode: 'n’importe', saisie: '4' }).stock_mode === 'jour')
}

// ═══ 4) CE QUE LA FICHE VEND ════════════════════════════════════════════════
{
  const e = (article, entreeJour, dejaCommande = 0) => etatStock({ article, entreeJour, dejaCommande })
  v('🔴 sans limite : rien ne limite', e({ stock_mode: 'illimite', stock_jour: 0 }).dispo === Infinity)
  v('🔴 sans limite ignore une quantité par jour qui traînerait',
    e({ stock_mode: 'illimite' }, { actif: true, stock: 2 }).dispo === Infinity)
  v('🔴 « indisponible ce jour » vaut SANS LIMITE aussi (le lunch du jour)',
    e({ stock_mode: 'illimite' }, { actif: false, stock: 0 }).actif === false && e({ stock_mode: 'illimite' }, { actif: false }).dispo === 0)
  v('🔴 en magasin, 0 est ÉPUISÉ (et non plus sans limite)', e({ stock_mode: 'magasin', stock_jour: 0 }).dispo === 0 && e({ stock_mode: 'magasin', stock_jour: 0 }).gere === true)
  v('en magasin : ce qui reste', e({ stock_mode: 'magasin', stock_jour: 3 }, null, 1).dispo === 2)
  v('en magasin, un réglage du jour ne remplace pas le stock', e({ stock_mode: 'magasin', stock_jour: 3 }, { actif: true, stock: 50 }).dispo === 3)
  v('par jour : le réglage du jour l’emporte', e({ stock_mode: 'jour', stock_jour: 30 }, { actif: true, stock: 10 }, 4).dispo === 6)
  v('par jour : la quantité de l’article sinon', e({ stock_mode: 'jour', stock_jour: 30 }, null, 4).dispo === 26)
  v('par jour : un réglage du jour à 0 est épuisé', e({ stock_mode: 'jour', stock_jour: 30 }, { actif: true, stock: 0 }).dispo === 0)
  v('🔴 par jour sans quantité ni réglage : sans limite, comme au serveur d’aujourd’hui',
    e({ stock_mode: 'jour', stock_jour: 0 }).dispo === Infinity && e({ stock_mode: 'jour', stock_jour: 0 }).gere === false)
  v('jamais négatif', e({ stock_mode: 'magasin', stock_jour: 2 }, null, 5).dispo === 0)
  v('🔴 un stock en magasin ne revient pas demain', revientUnAutreJour({ stock_mode: 'magasin' }) === false
    && revientUnAutreJour({ stock_mode: 'jour' }) === true && revientUnAutreJour({ stock_mode: 'illimite' }) === true)
}

// ═══ 5) LA VITRINE : LE MOT DU MÉTIER ═══════════════════════════════════════
{
  v('une boutique : « Disponible en boutique »', mentionVitrine({ categorie: 'detail', type: 'Vêtements' }) === 'Disponible en boutique')
  v('un restaurant : « Sur place uniquement »', mentionVitrine({ categorie: 'alimentaire', type: 'Restaurant' }) === 'Sur place uniquement')
  v('un boucher ou un salon : « Disponible sur place »', mentionVitrine({ categorie: 'alimentaire', type: 'Boucherie' }) === 'Disponible sur place'
    && mentionVitrine({ categorie: 'vitrine', type: 'Coiffeur' }) === 'Disponible sur place')
}

// ═══ 5b) LE CHOIX DU COMMERÇANT, LES DEUX POSSIBILITÉS DITES (Alex, 30/09) ══
{
  const boutique = choixDeVente({ categorie: 'detail', type: 'Vêtements' })
  v('deux choix, en ligne puis vitrine', boutique.length === 2 && boutique[0].vendable === true && boutique[1].vendable === false)
  v('🔴 chaque choix dit ce qu’il fait', boutique.every(c => c.titre && c.phrase && c.phrase.length > 20))
  v('la boutique : « vient l’acheter en boutique »', /vient l’acheter en boutique/.test(boutique[1].phrase))
  v('le restaurant : « le commande sur place »', /le commande sur place/.test(choixDeVente({ categorie: 'alimentaire', type: 'Restaurant' })[1].phrase))
  const bord = code('app/dashboard/ConfigDashboard.js')
  v('🔴 le formulaire montre LES DEUX choix, plus un interrupteur muet',
    /<ChoixCartes label="Comment le client l’achète \?" choix=\{choixDeVente\(commercant\)\}/.test(bord) && !/label="Vendu en ligne"/.test(bord))
  v('choisir règle « vendu en ligne »', /onChoisir=\{c => setForm\(p => \(\{ \.\.\.p, vendable: c\.vendable \}\)\)\}/.test(bord))
  v('et le choix affiché est celui de l’article', /estChoisi=\{c => !!form\.vendable === c\.vendable\}/.test(bord))
  // Même logique pour la visibilité (Alex, 30/09).
  v('🔴 visibilité : deux choix qui disent ce qu’ils font',
    CHOIX_VISIBILITE.length === 2 && CHOIX_VISIBILITE[0].actif === true && CHOIX_VISIBILITE[1].actif === false
    && CHOIX_VISIBILITE.every(c => c.titre && c.phrase))
  v('🔴 le formulaire les montre, plus l’interrupteur « Article disponible »',
    /<ChoixCartes label="Sur ta fiche \?" choix=\{CHOIX_VISIBILITE\}/.test(bord) && !/label=\{estVitrine \? 'Produit visible' : 'Article disponible'\}/.test(bord))
  v('choisir règle la visibilité', /onChoisir=\{c => setForm\(p => \(\{ \.\.\.p, actif: c\.actif \}\)\)\}/.test(bord) && /estChoisi=\{c => !!form\.actif === c\.actif\}/.test(bord))
  v('🔴 la carte de choix dit bien son choix (radio)', /role="radio" aria-checked=\{choisi\}\s*onClick=\{\(\) => onChoisir\(c\)\}/.test(bord))
}

// ═══ 6) LA FICHE : UNE SEULE RÈGLE, ET PLUS DE « DÈS » ══════════════════════
{
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 la carte de l’article lit la règle partagée', /const etat = etatStock\(\{ article, entreeJour: entryDay, dejaCommande \}\)/.test(fiche))
  v('🔴 la limite du panier lit la MÊME règle', /return etatStock\(\{ article, entreeJour: entryDay, dejaCommande \}\)\.dispo/.test(fiche))
  v('🔴 l’ancien calcul recopié a disparu', !/if \(!article\.stock_jour \|\| article\.stock_jour <= 0\) return Infinity/.test(fiche))
  v('🔴 un stock en magasin épuisé ne promet pas « demain »', /const prochain = epuiseAujourdhui && revientUnAutreJour\(article\) \? prochainJourDispo\(\) : null/.test(fiche))
  v('🔴 plus de « dès » ni de « Prix sur demande » sur la fiche', !/>\s*dès\s*</.test(fiche) && !/Prix sur demande/.test(fiche))
  v('🔴 en vitrine, le sélecteur d’ACHAT des versions ne s’ouvre pas', /\{showOptions && hasVariantes && !article\.est_vitrine && \(\s*<VariantesSelector/.test(fiche))
  v('en vitrine, les versions se lisent', /\{showOptions && hasVariantes && article\.est_vitrine && \(\s*<VariantesVitrine/.test(fiche) && /function VariantesVitrine\(/.test(fiche))
  v('🔴 en vitrine, aucune pastille de stock', /\{hasVariantes && !article\.est_vitrine \? \(\(\) => \{/.test(fiche) && /\{!hasVariantes && stockGere && !article\.est_vitrine && \(\(\) => \{/.test(fiche))
  v('la mention du métier arrive aux deux cartes', (fiche.match(/mentionVitrineTexte=\{mentionVitrine\(commercant\)\}/g) || []).length === 2)
  v('la fenêtre de l’article dit la mention et montre les versions', /\{mentionVitrine\(commercant\)\}/.test(fiche) && /\{hasVar && <VariantesVitrine article=\{article\} variantes=\{variantes\}\/>\}/.test(fiche))
  v('🔴 rien ne s’achète en vitrine depuis la fenêtre de l’article', /\{hasVar && onAjouterVariante && !article\.est_vitrine \? \(/.test(fiche) && /\(!hasVar && onAjouter && !article\.est_vitrine\) \? \(/.test(fiche))

  const rdv = code('app/commander/rdv/[slug]/page.js')
  v('🔴 la fiche des rendez-vous n’écrit plus « Sur demande »', !/return 'Sur demande'/.test(rdv) && !/Prix sur demande/.test(rdv) && !/>\s*dès\s*</.test(rdv))
  v('ses produits en vitrine disent la mention du métier', /\{mentionVitrine\(commercant\)\}/.test(rdv))
}

// ═══ 7) LE TABLEAU DE BORD ══════════════════════════════════════════════════
{
  const bord = code('app/dashboard/ConfigDashboard.js')
  const i = bord.indexOf('async function saveArticle()')
  const save = i >= 0 ? bord.slice(i, bord.indexOf('async function ajouterCategorie()', i)) : ''
  v('l’enregistrement d’un article a été retrouvé', save.length > 500, String(save.length))
  v('🔴 le prix est obligatoire, vitrine comprise', /if \(!form\.nom\.trim\(\) \|\| !\(parseFloat\(form\.prix\) > 0\)\) return toast\(/.test(save))
  v('🔴 un article vendu dit comment se compte son stock', /const refusStock = form\.vendable \? refusQuantite\(form\.stock_mode, form\.stock_jour\) : null\s*if \(refusStock\) return toast\(refusStock, 'error'\)/.test(save))
  v('🔴 le stock s’écrit par la règle partagée', /\? champsStock\(\{ mode: form\.stock_mode, saisie: form\.stock_jour, avant \}\)/.test(save) && /\.\.\.stock,/.test(save))
  v('🔴 en vitrine = pas vendu en ligne, pour TOUS les métiers', /est_vitrine: !form\.vendable,/.test(save) && !/est_vitrine: estVitrine \?/.test(save))
  v('🔴 « sans limite » retire les quantités par jour, et garde les jours indisponibles',
    /if \(editId && stock\.stock_mode === 'illimite'\) \{\s*const \{ error: errJours \} = await supabase\.from\('article_stock_jour'\)\s*\.delete\(\)\.eq\('article_id', editId\)\.eq\('actif', true\)/.test(save))
  v('et un retrait raté se dit', /if \(errJours\) \{/.test(save))
  v('🔴 un stock en magasin ajusté sur la carte repart de maintenant', /const maj = \{ stock_jour: n, stock_maj_le: new Date\(\)\.toISOString\(\) \}/.test(bord))
  v('🔴 plus de « prix indicatif » ni de « à partir de »', !/Prix indicatif/.test(bord) && !/>\s*à partir de\s*</.test(bord) && !/'Prix sur demande'/.test(bord))
  v('🔴 un article sans limite n’affiche pas « 0 » rouge sur ses jours', /\{afficheFerme \? '✕' : sansLimite \? '∞' : eff\.dispo\}/.test(bord))
  v('un article sans limite rouvre un jour sans quantité', /async function rouvrirJour\(articleId, jourSemaine\)/.test(bord) && /onRouvrirJour=\{rouvrirJour\}/.test(bord))
  v('🔴 une prestation a toujours son prix (sauf une table)', /if \(!formEstTable && String\(form\.prix \?\? ''\)\.trim\(\) === ''\) \{/.test(bord))
  v('🔴 la copie d’un article emporte son mode de stock', CHAMPS_COPIES.includes('stock_mode') && !CHAMPS_COPIES.includes('stock_maj_le'))
}

console.log(`\nStock et vitrine : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
