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
  revientUnAutreJour, mentionVitrine, choixDeVente, CHOIX_VISIBILITE, comptoirDuJour, choixDeStock,
  aDeuxCircuits, circuitsDeLArticle, circuitsCommuns, circuitDuJour, maximumSurCommande,
  refusCircuits, champsCircuits,
} from '../lib/stock-article.js'
import { refusDuJour, longueurCalendrier, mentionDisponibilite, delaiEnJours, propositionPourArticle } from '../lib/delai-commande.js'
import { verifierStockDisponible, itemsDeReservation, refusDeReservation, messageCircuit, SELECT_ARTICLES } from '../lib/lignes-commande.js'
import { jourBelgeDeCreation } from '../lib/heure-belge.js'
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

  // 🔴 LE COMPTOIR DU JOUR (Alex, 07/10) : saisi pour CE jour, il fait foi.
  const AUJ = '2026-10-07', DEMAIN = '2026-10-08'
  const croissant = { stock_mode: 'jour', stock_jour: 30, stock_comptoir: 12, stock_comptoir_le: AUJ }
  const c = (article, jour, entreeJour = null, deja = 0) => etatStock({ article, entreeJour, dejaCommande: deja, jour })
  v('🔴 aujourd’hui, le comptoir remplace la quantité du jour', c(croissant, AUJ, null, 3).dispo === 9)
  v('🔴 demain, la quantité sur commande revient', c(croissant, DEMAIN, null, 3).dispo === 27)
  v('🔴 sans jour donné, le comptoir ne dit rien', etatStock({ article: croissant, dejaCommande: 0 }).dispo === 30)
  v('🔴 un jour indisponible le reste, comptoir ou pas', c(croissant, AUJ, { actif: false }).actif === false)
  v('🔴 un article « sans limite » plafonné par son comptoir du matin',
    c({ stock_mode: 'illimite', stock_comptoir: 5, stock_comptoir_le: AUJ }, AUJ).dispo === 5)
  v('🔴 zéro au comptoir, c’est épuisé', c({ ...croissant, stock_comptoir: 0 }, AUJ).dispo === 0 && c({ ...croissant, stock_comptoir: 0 }, AUJ).gere === true)
  v('un comptoir vide ne dit rien', comptoirDuJour({ stock_comptoir: null, stock_comptoir_le: AUJ }, AUJ) === null
    && comptoirDuJour({ stock_comptoir: '', stock_comptoir_le: AUJ }, AUJ) === null)
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

  // ✅ 07/10, « ODOO MIND » (Alex) : le stock se choisit sur trois cartes qui
  // disent à quoi elles servent, avec des exemples ; l'alimentaire a ses mots.
  const alim = choixDeStock({ categorie: 'alimentaire', type: 'Boulangerie' })
  const det = choixDeStock({ categorie: 'detail', type: 'Vêtements' })
  v('trois choix, dans l’ordre des modes', alim.map(c => c.mode).join(',') === 'illimite,jour,magasin' && det.map(c => c.mode).join(',') === 'illimite,jour,magasin')
  v('🔴 chaque choix a une phrase ET des exemples', [...alim, ...det].every(c => c.titre && c.phrase && c.phrase.length > 20 && c.exemples && c.exemples.length > 10))
  // ⚠️ RÉORIENTÉE LE 08/10 : « Stock qui baisse », mot du modèle validé par
  // Alex ; l'intention reste (pas « Stock en magasin » sur un croissant, et
  // la phrase dit les produits emballés).
  v('🔴 en alimentaire, plus de « Stock en magasin » : « Stock qui baisse », pour les emballés',
    alim[2].titre === 'Stock qui baisse' && /emballés/.test(alim[2].phrase) && /confitures/.test(alim[2].exemples))
  v('les boutiques gardent « Stock en magasin »', det[2].titre === 'Stock en magasin')
  v('un service compte comme une boutique', choixDeStock({ categorie: 'vitrine' })[2].titre === 'Stock en magasin')
  v('🔴 le formulaire montre les cartes du stock, branchées sur le mode',
    // ⚠️ RÉORIENTÉE LE 08/10 (temps 3) : le libellé suit le circuit, et le
    // choix éteint « sur commande » pour un stock qui baisse.
    /<ChoixCartes label=\{deuxCircuits \? 'Comment se compte ce que tu vends le jour même \?' : 'Comment se compte le stock \?'\} choix=\{choixDeStock\(commercant\)\}/.test(bord)
    && /estChoisi=\{c => form\.stock_mode === c\.mode\}/.test(bord) && /onChoisir=\{c => setForm\(p => \(\{ \.\.\.p, stock_mode: c\.mode, /.test(bord))
  v('🔴 les exemples s’affichent sous chaque choix', /\{c\.exemples && \(/.test(bord) && /<strong>Par exemple :<\/strong> \{c\.exemples\}/.test(bord))
  v('🔴 plus de pattes de mouche dans le formulaire article (aucun texte en 10 px)',
    (() => { const i = bord.indexOf('function renderArticleForm()'); const f = bord.slice(i, bord.indexOf('function renderArticleCard(a)', i)); return i > 0 && !/fontSize: 10\b/.test(f) })())
  // ✅ « COMPTOIR DU JOUR » (Alex, 07/10) : une page, tous les articles « par
  // jour », un seul bouton ; même règle que la carte (reste + déjà commandé,
  // jour belge), et chaque écriture lue.
  v('🔴 l’onglet « Comptoir du jour » existe, en alimentaire seulement',
    /\['articles', 'comptoir', 'categories', 'personnalisation'\]/.test(bord)
    && /\.\.\.\(estAlimentaire \? \[\{ id: 'comptoir', label: 'Comptoir du jour', icon: 'clock' \}\] : \[\]\)/.test(bord)
    && /\{subTab === 'comptoir' && estAlimentaire && \(\(\) => \{/.test(bord))
  // ⚠️ RÉORIENTÉE LE 08/10 : et vendus le jour même (temps 3).
  v('🔴 il liste les articles « Quantité par jour » actifs et vendus en ligne',
    /return articles\.filter\(a => a\.actif !== false && a\.est_vitrine !== true && modeStockDe\(a\) === 'jour' && \(!deuxCircuits \|\| a\.vente_jour !== false\)\)/.test(bord))
  v('🔴 il enregistre le reste plus le déjà commandé, daté du jour belge',
    /const deja = commandesParArticleJour\[a\.id\]\?\.\[jourKey\] \|\| 0\s*const maj = \{ stock_comptoir: reste \+ deja, stock_comptoir_le: jour \}/.test(bord)
    && /async function enregistrerComptoir\(\) \{[\s\S]{0,120}const jour = jourBruxelles\(\)/.test(bord))
  v('🔴 seul ce que la base a accepté s’affiche, et un échec se dit',
    /const ok = resultats\.filter\(r => !r\.error\)/.test(bord) && /if \(ko\.length > 0\) \{/.test(bord))
  v('🔴 la journée finie bloque la saisie', /disabled=\{envoiComptoir \|\| journeeFinieAuj\}/.test(bord) && /disabled=\{journeeFinieAuj\}/.test(bord))
  v('🔴 l’horizon et « Réservable jusqu’à » se nomment l’un l’autre',
    /Ton horizon de réservation \(onglet Créneaux\) est de \$\{/.test(bord) && /se règle sur sa fiche : « Réservable jusqu&rsquo;à »/.test(bord))
  v('🔴 le temps de préparation ne paraît que si les créneaux se comptent en minutes (ou s’il est déjà réglé)',
    /\{estAlimentaire && \(capaciteEnMinutes \|\| Number\(form\.temps_prepa\) > 0\) && \(/.test(bord)
    && /\.eq\('commercant_id', commercantId\)\.eq\('mode_capacite', 'temps'\)/.test(bord))
}

// ═══ 6) LA FICHE : UNE SEULE RÈGLE, ET PLUS DE « DÈS » ══════════════════════
{
  const fiche = code('app/commander/[slug]/page.js')
  // ⚠️ RÉORIENTÉES LE 07/10 : le jour passe aussi (comptoir du jour).
  // ⚠️ RÉORIENTÉES LE 08/10 (temps 3) : les deux appels passent aussi le
  // circuit du jour ; le panier, le drapeau de l'invendu.
  v('🔴 la carte de l’article lit la règle partagée', /const etat = etatStock\(\{ article, entreeJour: entryDay, dejaCommande, jour: jourLocalISO\(jourDateSelectionne\), circuit \}\)/.test(fiche))
  v('🔴 la limite du panier lit la MÊME règle', /return etatStock\(\{ article, entreeJour: entryDay, dejaCommande, jour, circuit, invendu \}\)\.dispo/.test(fiche))
  v('🔴 l’ancien calcul recopié a disparu', !/if \(!article\.stock_jour \|\| article\.stock_jour <= 0\) return Infinity/.test(fiche))
  // ⚠️ RÉORIENTÉE LE 08/10 : la condition vit dans `revient`, qui ajoute le
  // sandwich vendu le jour même seulement (temps 3).
  v('🔴 un stock en magasin épuisé ne promet pas « demain »',
    /const revient = revientUnAutreJour\(article\) && \(circuit === null \|\| article\.commande_active === true\)/.test(fiche)
    && /const prochain = epuiseAujourdhui && revient \? prochainJourDispo\(\) : null/.test(fiche))
  v('🔴 plus de « dès » ni de « Prix sur demande » sur la fiche', !/>\s*dès\s*</.test(fiche) && !/Prix sur demande/.test(fiche))
  v('🔴 en vitrine, le sélecteur d’ACHAT des versions ne s’ouvre pas', /\{showOptions && hasVariantes && !article\.est_vitrine && \(\s*<VariantesSelector/.test(fiche))
  v('en vitrine, les versions se lisent', /\{showOptions && hasVariantes && article\.est_vitrine && \(\s*<VariantesVitrine/.test(fiche) && /function VariantesVitrine\(/.test(fiche))
  // ⚠️ RÉORIENTÉE LE 07/10 : `!etatJour` suit sur les deux pastilles (l'article
  // hors du jour choisi a sa propre ligne). La condition vitrine reste visée.
  v('🔴 en vitrine, aucune pastille de stock', /\{hasVariantes && !article\.est_vitrine && !etatJour \? \(\(\) => \{/.test(fiche) && /\{!hasVariantes && stockGere && !article\.est_vitrine && !etatJour && \(\(\) => \{/.test(fiche))
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
  // ⚠️ RÉORIENTÉE LE 08/10 : s'il se vend le jour même (temps 3).
  v('🔴 un article vendu dit comment se compte son stock', /const refusStock = form\.vendable && venteJour \? refusQuantite\(form\.stock_mode, form\.stock_jour\) : null\s*if \(refusStock\) return toast\(refusStock, 'error'\)/.test(save))
  v('🔴 le stock s’écrit par la règle partagée', /\? champsStock\(\{ mode: form\.stock_mode, saisie: form\.stock_jour, avant \}\)/.test(save) && /\.\.\.stock,/.test(save))
  v('🔴 en vitrine = pas vendu en ligne, pour TOUS les métiers', /est_vitrine: !form\.vendable,/.test(save) && !/est_vitrine: estVitrine \?/.test(save))
  v('🔴 « sans limite » retire les quantités par jour, et garde les jours indisponibles',
    /if \(editId && stock\.stock_mode === 'illimite'\) \{\s*const \{ error: errJours \} = await supabase\.from\('article_stock_jour'\)\s*\.delete\(\)\.eq\('article_id', editId\)\.eq\('actif', true\)/.test(save))
  v('et un retrait raté se dit', /if \(errJours\) \{/.test(save))
  v('🔴 un stock en magasin ajusté sur la carte repart de maintenant', /const maj = \{ stock_jour: n, stock_maj_le: new Date\(\)\.toISOString\(\) \}/.test(bord))
  v('🔴 plus de « prix indicatif » ni de « à partir de »', !/Prix indicatif/.test(bord) && !/>\s*à partir de\s*</.test(bord) && !/'Prix sur demande'/.test(bord))
  // ⚠️ RÉORIENTÉE LE 08/10 : « sur commande seulement » affiche ✓ (temps 3).
  v('🔴 un article sans limite n’affiche pas « 0 » rouge sur ses jours', /\{afficheFerme \? '✕' : !venteJour \? '✓' : sansLimite \? '∞' : eff\.dispo\}/.test(bord))
  v('un article sans limite rouvre un jour sans quantité', /async function rouvrirJour\(articleId, jourSemaine\)/.test(bord) && /onRouvrirJour=\{rouvrirJour\}/.test(bord))
  v('🔴 une prestation a toujours son prix (sauf une table)', /if \(!formEstTable && String\(form\.prix \?\? ''\)\.trim\(\) === ''\) \{/.test(bord))
  v('🔴 la copie d’un article emporte son mode de stock', CHAMPS_COPIES.includes('stock_mode') && !CHAMPS_COPIES.includes('stock_maj_le'))

  // 🔴 LE COMPTOIR (07/10) : écrit pour AUJOURD'HUI (jour belge, celui que
  // compare le serveur), avec l'erreur lue, et retirable.
  v('🔴 le comptoir s’écrit daté du jour belge, ou se retire',
    /\? \{ stock_comptoir: null, stock_comptoir_le: null \}\s*: \{ stock_comptoir: Math\.max\(0, parseInt\(brut, 10\) \|\| 0\), stock_comptoir_le: jourBruxelles\(\) \}/.test(bord))
  v('et une écriture refusée se dit', /if \(error\) \{ toast\(`Le comptoir n’a pas pu être enregistré : \$\{error\.message\}`, 'error'\); return \}/.test(bord))
  v('🔴 il saisit ce qui RESTE : on enregistre le reste plus le déjà commandé', /onSetComptoir\(a\.id, reste \+ dejaCommande\)/.test(bord))
  v('🔴 la carte lit le comptoir d’aujourd’hui par la règle partagée', /const comptoirAuj = comptoirDuJour\(a, jourBruxelles\(\)\)/.test(bord))
  v('la carte reçoit la fonction', /onSetComptoir=\{setComptoir\}/.test(bord))
  // 🔴 CACHÉ LE SOIR (Alex, 07/10) : boutique fermée pour la journée, le
  // comptoir n'a plus d'effet et piégeait le test du mercredi soir.
  v('🔴 le bouton du comptoir disparaît quand la journée est finie',
    // ⚠️ RÉORIENTÉE LE 08/10 : `venteJour` s'ajoute (temps 3).
    /\{parJours && venteJour && onSetComptoir && !effAuj\.ferme && !congeAuj && !journeeFinie && \(/.test(bord)
    && /journeeFinie=\{journeeFinieAuj\}/.test(bord))
  v('🔴 « journée finie » lit la fermeture du jour (dernière plage) à l’heure belge',
    /const f = fermetureDuJour\(commercant\?\.horaires_detail, nom\)\s*const m = minutesBruxelles\(\)\s*return f !== null && m !== null && m >= f/.test(bord))
  // 🔴 07/10 : « Mer 3 » ÉTAIT LE COMPTOIR. La grille ne le lit plus ; seule la
  // pastille du jour le lit. Et « Retirer » reste visible le soir.
  v('🔴 seule la pastille du jour lit le comptoir, pas la grille',
    /const effAuj = dispoEffectif\(jourActuelKey, true\)/.test(bord) && /if \(avecComptoir && jour === jourActuelKey && comptoirAuj !== null\)/.test(bord)
    && /const eff = dispoEffectif\(jour\)\s*const ferme = eff\.ferme/.test(bord))
  v('🔴 « Retirer le comptoir » reste visible tant qu’un comptoir est saisi',
    /\{onSetComptoir && effAuj\.comptoir && \(\s*<button type="button" onClick=\{\(\) => onSetComptoir\(a\.id, null\)\}/.test(bord))
  // 🔴 LE FORMULAIRE DIT QUAND LA GRILLE LE REMPLACE (Alex, 07/10).
  v('🔴 le formulaire annonce les jours où la grille remplace la quantité',
    /form\.stock_mode === 'jour' && editId && \(\(\) => \{\s*const remplaces = JOURS_KEYS/.test(bord) && /\.filter\(\(\[, e\]\) => e && e\.actif !== false\)/.test(bord))
  v('🔴 « Revenir à … tous les jours » efface les remplacements, garde les jours fermés',
    /\.delete\(\)\.eq\('article_id', articleId\)\.eq\('actif', true\)\s*if \(error\) \{ toast\(`Les quantités par jour n’ont pas pu être retirées/.test(bord)
    && /onClick=\{\(\) => revenirAuDefaut\(editId\)\}/.test(bord))
  v('et il annonce le chiffre ENREGISTRÉ, pas celui en cours de frappe', /Revenir à \{articles\.find\(x => x\.id === editId\)\?\.stock_jour/.test(bord))
  v('les libellés disent ce qui est vendu en ligne et ce qui reste au comptoir',
    /'Jours de vente' : 'Vendu en ligne par jour'/.test(bord) && /'Reste au comptoir aujourd’hui'/.test(bord))
  v('🔴 la copie emporte « Réservable jusqu’à », pas le comptoir du jour',
    CHAMPS_COPIES.includes('horizon_jours') && !CHAMPS_COPIES.includes('stock_comptoir') && !CHAMPS_COPIES.includes('stock_comptoir_le'))
  v('🔴 le formulaire enregistre « Réservable jusqu’à », vide = automatique',
    /horizon_jours: \(estVitrine \|\| !form\.vendable \|\| form\.horizon_jours === '' \|\| form\.horizon_jours == null\)\s*\? null : \(parseInt\(form\.horizon_jours, 10\) \|\| null\),/.test(save))
}

// ═══ 8) LE COMPTOIR, CÔTÉ FICHE ET SERVEUR (07/10) ═════════════════════════
{
  const fiche = code('app/commander/[slug]/page.js')
  // ⚠️ RÉORIENTÉES LE 08/10 (temps 3) : le circuit voyage avec le jour.
  v('🔴 la carte de la fiche passe le jour au calcul du stock',
    /etatStock\(\{ article, entreeJour: entryDay, dejaCommande, jour: jourLocalISO\(jourDateSelectionne\), circuit \}\)/.test(fiche))
  v('🔴 le panier aussi (getStockMax)',
    /const jour = jourLocalISO\(jourDateSelectionne\)[\s\S]{0,600}return etatStock\(\{ article, entreeJour: entryDay, dejaCommande, jour, circuit, invendu \}\)\.dispo/.test(fiche))
  const lc = code('lib/lignes-commande.js')
  v('🔴 le serveur lit le comptoir des articles', /\.select\('id, stock_jour, stock_comptoir, stock_comptoir_le, vente_jour, commande_active, commande_max_jour'\)/.test(lc))
  v('🔴 et le fait passer devant la grille, après le jour indisponible',
    /const stockBrut = comptoir !== null\s*\? comptoir\s*: stockEntry/.test(lc)
    && lc.indexOf("if (stockEntry?.actif === false)") < lc.indexOf('const stockBrut = comptoir !== null'))
}

// ═══ 9) LES DEUX CIRCUITS DE L'ALIMENTAIRE (temps 3, Alex 08/10) ═══════════
//
// A « vendu aujourd'hui », B « sur commande » pour un autre jour. Les six cas
// d'Alex, EXÉCUTÉS, puis le serveur avec une fausse base, puis les appelants.
// Aujourd'hui = jeudi 08/10/2026 ; samedi = 10/10.
{
  const AUJ = '2026-10-08', DEMAIN = '2026-10-09', SAMEDI = '2026-10-10'
  const ALIM = { categorie: 'alimentaire', type: 'Boulangerie' }
  const BOUTIQUE = { categorie: 'detail', type: 'Vêtements' }
  const SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']

  // Les six articles d'Alex.
  const croissant = { id: 'c', nom: 'Croissant', vente_jour: true, commande_active: true, delai_minutes: 1440, commande_max_jour: 40, stock_mode: 'jour', stock_jour: 30, stock_comptoir: 5, stock_comptoir_le: AUJ }
  const pain = { id: 'p', nom: 'Pain longue fermentation', vente_jour: false, commande_active: true, delai_minutes: 2880, commande_max_jour: 20, stock_mode: 'jour', stock_jour: 0 }
  const tarteSpeciale = { id: 't', nom: 'Tarte spéciale', vente_jour: false, commande_active: true, delai_minutes: 2880, commande_max_jour: null, stock_mode: 'illimite', stock_jour: 0 }
  const tartePommes = { id: 'tp', nom: 'Tarte aux pommes', vente_jour: true, commande_active: true, delai_minutes: 2880, commande_max_jour: null, stock_mode: 'jour', stock_jour: 4 }
  const pot = { id: 'po', nom: 'Pot de confiture', vente_jour: true, commande_active: false, delai_minutes: 0, stock_mode: 'magasin', stock_jour: 8 }
  const sandwich = { id: 's', nom: 'Sandwich', vente_jour: true, commande_active: false, delai_minutes: 0, stock_mode: 'jour', stock_jour: 12 }
  const regle = (a, indispo = []) => ({ delaiJours: delaiEnJours(a), indispo, circuits: circuitsDeLArticle(a, ALIM) })

  // ─── Qui a deux circuits ───
  v('🔴 l’alimentaire a deux circuits, la boutique et le service non',
    aDeuxCircuits(ALIM) && aDeuxCircuits({ categorie: 'alimentaire' }) && !aDeuxCircuits(BOUTIQUE) && !aDeuxCircuits({ categorie: 'vitrine' }))
  v('hors alimentaire : aucun circuit, aucun circuit du jour',
    circuitsDeLArticle(croissant, BOUTIQUE) === null && circuitDuJour({ commercant: BOUTIQUE, jour: SAMEDI, aujourdhui: AUJ }) === null)
  v('🔴 aujourd’hui = A, un autre jour = B',
    circuitDuJour({ commercant: ALIM, jour: AUJ, aujourdhui: AUJ }) === 'A' && circuitDuJour({ commercant: ALIM, jour: SAMEDI, aujourdhui: AUJ }) === 'B')
  v('🔴 une ligne lue SANS les colonnes : A ouvert (défaut en base), B fermé (comme IS NOT TRUE)',
    JSON.stringify(circuitsDeLArticle({}, ALIM)) === '{"aujourdhui":true,"surCommande":false}')
  v('un duo n’a que les circuits communs à ses deux articles',
    JSON.stringify(circuitsCommuns(circuitsDeLArticle(croissant, ALIM), circuitsDeLArticle(pot, ALIM))) === '{"aujourdhui":true,"surCommande":false}'
    && circuitsCommuns(null, null) === null)
  v('le maximum par jour : vide = sans limite, 40 = 40',
    maximumSurCommande(tarteSpeciale) === null && maximumSurCommande(croissant) === 40 && maximumSurCommande({ commande_max_jour: '' }) === null)

  // ─── 1) Le croissant : A 5 au comptoir + B J+1 40 ───
  {
    const a = etatStock({ article: croissant, jour: AUJ, circuit: 'A' })
    v('🔴 croissant aujourd’hui : les 5 du comptoir', a.actif && a.dispo === 5, JSON.stringify(a))
    const b = etatStock({ article: croissant, jour: SAMEDI, circuit: 'B', dejaCommande: 12 })
    v('🔴 croissant samedi : 40 sur commande, 12 déjà pris → 28, JAMAIS les 5 du comptoir', b.actif && b.dispo === 28, JSON.stringify(b))
    v('croissant : aujourd’hui ET demain se commandent',
      refusDuJour({ ...regle(croissant), jour: AUJ, aujourdhui: AUJ }) === null && refusDuJour({ ...regle(croissant), jour: DEMAIN, aujourdhui: AUJ }) === null)
    v('🔴 croissant : aucune mention sur la carte (la baguette d’avant, règle du 04/09)', mentionDisponibilite(regle(croissant)) === null)
  }
  // ─── 2) Le pain longue fermentation : B seul, J+2, 20, samedi et dimanche ───
  {
    const r = regle(pain, SEMAINE)
    v('🔴 pain : pas aujourd’hui (jeudi n’est pas un jour de vente)', refusDuJour({ ...r, jour: AUJ, aujourdhui: AUJ })?.raison === 'jour')
    v('pain : pas vendredi non plus', refusDuJour({ ...r, jour: DEMAIN, aujourdhui: AUJ })?.raison === 'jour')
    v('🔴 pain : samedi passe (jeudi pour samedi)', refusDuJour({ ...r, jour: SAMEDI, aujourdhui: AUJ }) === null)
    const sansJours = refusDuJour({ ...regle(pain), jour: AUJ, aujourdhui: AUJ })
    v('🔴 B seul aujourd’hui = « trop tôt », avec son premier jour (pas « indisponible »)',
      sansJours?.raison === 'delai' && sansJours.plancher === SAMEDI && sansJours.jours === 2, JSON.stringify(sansJours))
    v('pain : la mention dit les jours et la date limite',
      mentionDisponibilite(r) === 'Samedi et dimanche seulement · commande au plus tard jeudi pour samedi, vendredi pour dimanche', mentionDisponibilite(r))
    v('🔴 pain : aujourd’hui, le circuit A le refuse', etatStock({ article: pain, jour: AUJ, circuit: 'A' }).actif === false)
    v('pain : samedi, 20 sur commande', etatStock({ article: pain, jour: SAMEDI, circuit: 'B', dejaCommande: 5 }).dispo === 15)
  }
  // ─── 3) La tarte spéciale : B seul, J+2, sans limite ───
  {
    const b = etatStock({ article: tarteSpeciale, jour: SAMEDI, circuit: 'B', dejaCommande: 99 })
    v('🔴 tarte spéciale samedi : sans limite', b.actif && b.gere === false && b.dispo === Infinity, JSON.stringify(b))
    v('tarte spéciale : vendredi est trop tôt, samedi passe',
      refusDuJour({ ...regle(tarteSpeciale), jour: DEMAIN, aujourdhui: AUJ })?.plancher === SAMEDI && refusDuJour({ ...regle(tarteSpeciale), jour: SAMEDI, aujourdhui: AUJ }) === null)
  }
  // ─── 4) La tarte aux pommes : A 4 + B J+2 ───
  {
    v('🔴 tarte aux pommes aujourd’hui : les 4 du jour', etatStock({ article: tartePommes, jour: AUJ, circuit: 'A', dejaCommande: 1 }).dispo === 3)
    v('🔴 tarte aux pommes : aujourd’hui oui, demain non (J+2), samedi oui',
      refusDuJour({ ...regle(tartePommes), jour: AUJ, aujourdhui: AUJ }) === null
      && refusDuJour({ ...regle(tartePommes), jour: DEMAIN, aujourdhui: AUJ })?.raison === 'delai'
      && refusDuJour({ ...regle(tartePommes), jour: SAMEDI, aujourdhui: AUJ }) === null)
    v('tarte aux pommes : la mention dit les deux',
      mentionDisponibilite(regle(tartePommes)) === "Le jour même, ou commande 2 jours à l'avance", mentionDisponibilite(regle(tartePommes)))
  }
  // ─── 5) Le pot : A, stock qui baisse 8 ───
  {
    v('🔴 pot aujourd’hui : son stock', etatStock({ article: pot, jour: AUJ, circuit: 'A', dejaCommande: 3 }).dispo === 5)
    v('🔴 pot demain : le jour même seulement',
      refusDuJour({ ...regle(pot), jour: DEMAIN, aujourdhui: AUJ })?.raison === 'aujourdhui_seulement'
      && etatStock({ article: pot, jour: DEMAIN, circuit: 'B' }).raison === 'pas_sur_commande')
  }
  // ─── 6) Le sandwich : A seul ───
  {
    v('🔴 sandwich samedi : le jour même seulement', refusDuJour({ ...regle(sandwich), jour: SAMEDI, aujourdhui: AUJ })?.raison === 'aujourdhui_seulement')
    v('sandwich : aucune mention (rien ne le distingue de la baguette d’avant)', mentionDisponibilite(regle(sandwich)) === null)
    const p = propositionPourArticle({ candidat: sandwich, panier: [], jourChoisi: SAMEDI, aujourdhui: AUJ, jours: [AUJ, DEMAIN, SAMEDI], regle: l => regle(l) })
    v('🔴 sandwich choisi pour samedi : la fiche propose aujourd’hui', p.type === 'vide' && p.jour === AUJ, JSON.stringify(p))
  }
  // ─── L'invendu ignore le circuit (règle du 04/09) ───
  v('🔴 invendu d’une tarte « sur commande seulement » : passe aujourd’hui',
    refusDuJour({ ...regle(tarteSpeciale), jour: AUJ, aujourdhui: AUJ, invendu: true }) === null
    && etatStock({ article: tarteSpeciale, jour: AUJ, circuit: 'A', invendu: true }).dispo === Infinity)
  v('mais la tarte à l’unité, elle, reste refusée aujourd’hui',
    etatStock({ article: tarteSpeciale, jour: AUJ, circuit: 'A' }).raison === 'pas_aujourdhui')
  v('🔴 un jour rendu indisponible le reste dans les deux circuits',
    etatStock({ article: croissant, entreeJour: { actif: false }, jour: SAMEDI, circuit: 'B' }).actif === false)

  // ─── Le calendrier (Alex, tableau 08/10 : horizon du commerce pour A + B J+1) ───
  const cal = arts => longueurCalendrier({ horizon: 2, articles: arts.map(a => ({ ...regle(a), horizonJours: a.horizon_jours })) })
  v('🔴 A + B à J+1 suit l’horizon du commerce (la pizzeria ne s’ouvre pas sur 8 jours)', cal([croissant]) === 2, String(cal([croissant])))
  v('A seul n’allonge rien', cal([sandwich, pot]) === 2)
  v('🔴 B seul à J+2 ouvre une semaine après son délai', cal([tarteSpeciale]) === 9, String(cal([tarteSpeciale])))
  v('A + B à J+2 aussi', cal([tartePommes]) === 9)
  v('« Réservable jusqu’à » allonge A + B à J+1', cal([{ ...croissant, horizon_jours: 14 }]) === 15)
  v('mais pas un article vendu le jour même seulement', cal([{ ...sandwich, horizon_jours: 30 }]) === 2)

  // ─── Le jour belge d'une commande (created_at SANS fuseau, en UTC) ───
  v('🔴 22 h 30 UTC le 07/10 = 0 h 30 le 08/10 à Bruxelles', jourBelgeDeCreation('2026-10-07T22:30:00') === '2026-10-08')
  v('🔴 21 h 30 UTC le 07/10 = 23 h 30 le 07/10 à Bruxelles (la veille)', jourBelgeDeCreation('2026-10-07T21:30:00.123456') === '2026-10-07')
  v('un horodatage déjà marqué se lit tel quel', jourBelgeDeCreation('2026-10-07T22:30:00+00:00') === '2026-10-08' && jourBelgeDeCreation('2026-10-07 22:30:00Z') === '2026-10-08')
  v('rien ou illisible : null', jourBelgeDeCreation(null) === null && jourBelgeDeCreation('n importe quoi') === null)

  // ─── Les refus de la réservation SQL, traduits ───
  {
    const noms = { 'aaaaaaaa-0000-0000-0000-000000000001': 'Sandwich' }
    const r1 = refusDeReservation('ARTICLE_PAS_SUR_COMMANDE:aaaaaaaa-0000-0000-0000-000000000001', noms)
    v('🔴 ARTICLE_PAS_SUR_COMMANDE devient une phrase qui nomme l’article', r1?.status === 409 && r1.body.error === messageCircuit('ARTICLE_PAS_SUR_COMMANDE', 'Sandwich'))
    const r2 = refusDeReservation('ARTICLE_PAS_AUJOURDHUI:aaaaaaaa-0000-0000-0000-000000000001', noms)
    v('🔴 ARTICLE_PAS_AUJOURDHUI aussi', r2?.status === 409 && /pas pour aujourd'hui/.test(r2.body.error))
    v('les deux motifs d’avant gardent leur réponse',
      refusDeReservation('STOCK_INSUFFISANT:aaaaaaaa-0000-0000-0000-000000000001:2', noms)?.body.stock_disponible === 2
      && refusDeReservation('ARTICLE_INACTIF:aaaaaaaa-0000-0000-0000-000000000001', noms)?.status === 400)
    v('une autre erreur n’est pas un refus connu', refusDeReservation('deadlock detected', noms) === null)
  }

  // ─── LE SERVEUR, EXÉCUTÉ CONTRE UNE FAUSSE BASE ───
  const fausseBase = (tables, panne = null) => ({
    from(t) {
      const res = { data: tables[t] ?? [], error: panne === t ? { message: 'panne' } : null }
      const q = { select: () => q, in: () => q, eq: () => q, not: () => q, gt: () => q, then: (ok, ko) => Promise.resolve(res).then(ok, ko) }
      return q
    },
  })
  const MAINTENANT = new Date('2026-10-08T10:00:00Z')
  const ligne = (a, quantite, extra = {}) => ({ article_id: a.id, article_nom: a.nom, quantite, quantite_stock: quantite, ...extra })
  const verif = (art, lignes, jour, commandes = [], commercant = ALIM, panne = null) => verifierStockDisponible({
    supabase: fausseBase({ articles: [art], commande_articles: commandes, article_stock_jour: [], commande_stock_reservation: [] }, panne),
    lignes, commercantId: 'm', dateCommande: jour, commercant, maintenant: MAINTENANT,
  })
  const cmd = (a, quantite, created_at) => ({ article_id: a.id, quantite, commande: { created_at } })

  // A aujourd'hui : seules les commandes PASSÉES aujourd'hui entament le comptoir.
  const veille = cmd(croissant, 10, '2026-10-07T15:00:00')
  const duJour = cmd(croissant, 2, '2026-10-08T07:00:00')
  v('🔴 serveur, A : la commande de la veille pour aujourd’hui ne prend pas le comptoir (5 - 2 = 3)',
    (await verif(croissant, [ligne(croissant, 3)], AUJ, [veille, duJour])).ok === true)
  const trop = await verif(croissant, [ligne(croissant, 4)], AUJ, [veille, duJour])
  v('🔴 serveur, A : 4 sur 3 restants est refusé', trop.ok === false && trop.stock_disponible === 3, JSON.stringify(trop))
  // B samedi : toutes les commandes de ce jour comptent, sur le maximum.
  const samedi38 = [cmd(croissant, 30, '2026-10-05T09:00:00'), cmd(croissant, 8, '2026-10-08T07:00:00')]
  const bTrop = await verif(croissant, [ligne(croissant, 3)], SAMEDI, samedi38)
  v('🔴 serveur, B : 40 - 38 = 2, 3 est refusé', bTrop.ok === false && bTrop.stock_disponible === 2 && bTrop.status === 409, JSON.stringify(bTrop))
  v('serveur, B : 2 passe', (await verif(croissant, [ligne(croissant, 2)], SAMEDI, samedi38)).ok === true)
  const sB = await verif(sandwich, [ligne(sandwich, 1)], SAMEDI)
  v('🔴 serveur : le sandwich pour samedi est refusé, avec la phrase', sB.ok === false && sB.error === messageCircuit('ARTICLE_PAS_SUR_COMMANDE', 'Sandwich'), JSON.stringify(sB))
  const tA = await verif(tarteSpeciale, [ligne(tarteSpeciale, 1)], AUJ)
  v('🔴 serveur : la tarte « sur commande » pour aujourd’hui est refusée', tA.ok === false && tA.error === messageCircuit('ARTICLE_PAS_AUJOURDHUI', 'Tarte spéciale'))
  const offre = { heure_debut: '16:00', heure_fin: '19:00' }
  const tInv = await verif(tarteSpeciale, [ligne(tarteSpeciale, 1, { offre })], AUJ)
  v('🔴 serveur : son INVENDU passe, et part marqué vers la réservation',
    tInv.ok === true && JSON.stringify(itemsDeReservation(tInv)) === '[{"article_id":"t","quantite":1,"invendu":true}]', JSON.stringify(tInv))
  const tMix = await verif(tarteSpeciale, [ligne(tarteSpeciale, 1, { offre }), ligne(tarteSpeciale, 1)], AUJ)
  v('🔴 serveur : invendu + tarte à l’unité dans le même panier = refusé (l’unité n’est pas un invendu)', tMix.ok === false)
  v('un article ordinaire part SANS drapeau',
    JSON.stringify(itemsDeReservation(await verif(croissant, [ligne(croissant, 1)], SAMEDI))) === '[{"article_id":"c","quantite":1}]')
  // Boutique : pas de circuit, toutes les commandes du jour comptent comme avant.
  const robe = { id: 'r', nom: 'Robe', stock_jour: 3, stock_mode: 'magasin' }
  const bout = await verif(robe, [ligne(robe, 2)], SAMEDI, [cmd(robe, 2, '2026-10-01T10:00:00')], BOUTIQUE)
  v('🔴 serveur, boutique : rien ne change (3 - 2 = 1, 2 est refusé, sans colonne de circuit)', bout.ok === false && bout.stock_disponible === 1, JSON.stringify(bout))
  const panne = await verif(croissant, [ligne(croissant, 1)], SAMEDI, [], ALIM, 'articles')
  v('🔴 serveur : une lecture en échec refuse (503), ni « zéro vendu » ni « pas sur commande »', panne.ok === false && panne.status === 503, JSON.stringify(panne))

  // ─── LES APPELANTS ───
  // 🔴 LA COLONNE ABSENTE DU SELECT (relecture du 08/10) : la route juge les
  // circuits sur les lignes de SELECT_ARTICLES. On ne cherche pas un mot, on
  // EXÉCUTE la règle sur un article réduit aux colonnes de ce select.
  {
    const colonnes = SELECT_ARTICLES.split(',').map(c => c.trim())
    const lu = Object.fromEntries(colonnes.filter(c => c in croissant).map(c => [c, croissant[c]]))
    v('🔴 le croissant lu par SELECT_ARTICLES se commande encore pour samedi',
      refusDuJour({ ...regle(lu), jour: SAMEDI, aujourdhui: AUJ }) === null, SELECT_ARTICLES)
    const luPain = Object.fromEntries(colonnes.filter(c => c in pain).map(c => [c, pain[c]]))
    v('🔴 et le pain sur commande seulement reste refusé aujourd’hui', refusDuJour({ ...regle(luPain), jour: AUJ, aujourdhui: AUJ, indispo: [] })?.raison === 'delai')
  }
  const lc = code('lib/lignes-commande.js')
  v('🔴 le serveur lit created_at pour le circuit A',
    /commande:commandes!inner\(date_commande, statut, commercant_id, created_at\)/.test(lc)
    && /if \(circuit === 'A' && jourBelgeDeCreation\(r\.commande\?\.created_at\) !== dateCommande\) return/.test(lc))
  const cc = code('app/api/stripe/checkout/create-commande/route.js')
  v('🔴 create-commande : le commerce part au contrôle du stock',
    /verifierStockDisponible\(\{\s*supabase, lignes, commercantId: commercant\.id, dateCommande: date_commande, commercant,\s*\}\)/.test(cc))
  v('🔴 create-commande : la réservation reçoit le drapeau de l’invendu, et ses refus sont traduits',
    /const items = itemsDeReservation\(verifStock\)/.test(cc) && /const refus = refusDeReservation\(errStock\.message, nomParArticle\)/.test(cc))
  v('🔴 create-commande : chaque ligne passe ses circuits et l’invendu à la règle du jour',
    /refusDuJour\(\{ delaiJours: n, jour: date_commande, aujourdhui, circuits, invendu: porteUneFenetre\(l\.offre\) \}\)/.test(cc)
    && /circuits = circuitsCommuns\(circuits, circuitsDeLArticle\(secondDuDuoParId\[String\(l\.deal_article2_id\)\], commercant\)\)/.test(cc)
    && /if \(refus\?\.raison === 'aujourdhui_seulement'\)/.test(cc))
  v('🔴 create-commande : le second article d’un duo est lu AVEC ses circuits',
    /\.from\('articles'\)\.select\('id, delai_minutes, vente_jour, commande_active'\)/.test(cc))
  v('🔴 create-commande : l’horizon lit les circuits du catalogue',
    /\.select\('id, delai_minutes, horizon_jours, vente_jour, commande_active'\)/.test(cc) && /horizonJours: a\.horizon_jours, circuits: circuitsDeLArticle\(a, commercant\)/.test(cc))
  const rdv = code('app/api/stripe/checkout/create-rdv-commande/route.js')
  v('🔴 create-rdv-commande : même contrôle, même réservation, mêmes refus',
    /dateCommande: date_rdv, commercant,/.test(rdv) && /p_items: itemsDeReservation\(verifStock\)/.test(rdv) && /refusDeReservation\(errStock\.message, nomParArticle\)/.test(rdv))
  v('🔴 aucune route ne recopie plus la traduction des refus',
    !/msg\.match\(\/STOCK_INSUFFISANT/.test(cc) && !/msg\.match\(\/STOCK_INSUFFISANT/.test(rdv))
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 fiche : la règle du jour lit les circuits sur le CATALOGUE, duo compris',
    /const article = articles\.find\(a => a\.id === ligne\?\.id\) \|\| ligne/.test(fiche)
    && /return \{ delaiJours: delaiEnJours\(ligne\), indispo, circuits, invendu: porteUneFenetre\(ligne\?\.offre\) \}/.test(fiche))
  v('🔴 fiche : les cartes reçoivent le circuit du jour, calculé par la règle partagée',
    (fiche.match(/circuit=\{circuitAffiche\}/g) || []).length === 2
    && /const circuitAffiche = circuitDuJour\(\{ commercant, jour: jourDuPanier\(\), aujourdhui: aujourdhuiISO\(\) \}\)/.test(fiche))
  v('🔴 fiche : la règle du jour part des circuits de l’article',
    /let circuits = circuitsDeLArticle\(article, commercant\)/.test(fiche)
    && /circuits = circuitsCommuns\(circuits, circuitsDeLArticle\(second, commercant\)\)/.test(fiche))
  // 🔴 ALEX, 08/10 AU TEST : « épuisé » sans dire qu'il se commande demain.
  v('🔴 fiche : épuisé aujourd’hui + premier autre jour, seulement en A et pour un article sur commande',
    /if \(circuitAffiche !== 'A' \|\| article\?\.commande_active !== true \|\| article\.est_vitrine\) return null/.test(fiche)
    && /const jour = joursDuCalendrier\(\)\.find\(j => j > auj && !refusDuJour\(\{ \.\.\.r, jour: j, aujourdhui: auj \}\)\) \|\| null/.test(fiche)
    && (fiche.match(/relais=\{relaisAutreJour\(a\)\} onCommanderAutreJour=\{commanderUnAutreJour\}/g) || []).length === 2)
  v('🔴 fiche : le bouton passe par la fenêtre habituelle (panier jamais vidé)',
    /jours: joursDuCalendrier\(\)\.filter\(j => j > auj\), regle: regleArticle,/.test(fiche)
    && /setPropositionJour\(\{ \.\.\.p, nomArticle: article\?\.nom \|\| 'Cet article', rejouer: ajout \? \{ article \} : null \}\)/.test(fiche)
    && /if \(relais && onCommanderAutreJour\) \{/.test(fiche) && /Commander pour \{relais\.libelle\} →/.test(fiche))
  v('🔴 fiche : le panier compte le circuit du jour affiché',
    /const circuit = circuitDuJour\(\{ commercant, jour, aujourdhui: jourLocalISO\(new Date\(\)\) \}\)/.test(fiche))
  v('🔴 fiche : le calendrier lit les circuits (même règle que le serveur)',
    /horizonJours: a\.horizon_jours, circuits: circuitsDeLArticle\(a, c\)/.test(fiche))
  v('🔴 fiche : l’invendu ignore le circuit au panier',
    /getStockMax\(article\.id, \{ invendu: porteUneFenetre\(deal\) \}\)/.test(fiche) && (fiche.match(/getStockMax\(item\.id, \{ invendu: porteUneFenetre\(item\.offre\) \}\)/g) || []).length === 2)
  const sql = lire('migrations/MIGRATION_TEMPS3_DEUX_CIRCUITS.sql')
  v('🔴 la migration de la prod laisse passer l’invendu', /IF \(v_item->>'invendu'\) = 'true' THEN\s*CONTINUE;/.test(sql))

  // ─── LE TABLEAU DE BORD : LES DEUX SECTIONS, EXÉCUTÉES PUIS VISÉES ───
  v('🔴 ni le jour même ni sur commande : refusé', refusCircuits({ vente_jour: false, commande_active: false }) !== null)
  v('A seul : accepté sans délai', refusCircuits({ vente_jour: true, commande_active: false, delai_minutes: 0 }) === null)
  v('🔴 B sans délai d’au moins 1 jour : refusé', refusCircuits({ vente_jour: true, commande_active: true, delai_minutes: 0, stock_mode: 'jour' }) !== null)
  v('🔴 B avec un maximum de 0 : refusé (vide = sans limite)',
    refusCircuits({ commande_active: true, delai_minutes: 1440, commande_max_jour: '0' }) !== null
    && refusCircuits({ commande_active: true, delai_minutes: 1440, commande_max_jour: '' }) === null
    && refusCircuits({ commande_active: true, delai_minutes: 2880, commande_max_jour: '40' }) === null)
  v('🔴 un stock qui baisse ne se prend pas sur commande', refusCircuits({ vente_jour: true, commande_active: true, delai_minutes: 1440, stock_mode: 'magasin' }) !== null)
  const ecritA = champsCircuits({ vente_jour: true, commande_active: false, delai_minutes: '2880', commande_max_jour: '40', horizon_jours: '14' })
  v('🔴 hors de B, ni délai, ni maximum, ni « Réservable jusqu’à » (ils allongeraient le calendrier pour rien)',
    JSON.stringify(ecritA) === '{"vente_jour":true,"commande_active":false,"delai_minutes":0,"commande_max_jour":null,"horizon_jours":null}', JSON.stringify(ecritA))
  const ecritB = champsCircuits({ vente_jour: false, commande_active: true, delai_minutes: '2880', commande_max_jour: '20', horizon_jours: '' })
  v('🔴 en B : des nombres, pas les chaînes du formulaire ; vide = automatique',
    JSON.stringify(ecritB) === '{"vente_jour":false,"commande_active":true,"delai_minutes":2880,"commande_max_jour":20,"horizon_jours":null}', JSON.stringify(ecritB))
  v('en B, un délai sous 1 jour est relevé à 1 jour', champsCircuits({ commande_active: true, delai_minutes: '0' }).delai_minutes === 1440)
  v('🔴 « Se renouvelle chaque jour », « Stock qui baisse », « Sans limite » (mots validés par Alex)',
    choixDeStock(ALIM).map(c => c.titre).join(' | ') === 'Sans limite | Se renouvelle chaque jour | Stock qui baisse', choixDeStock(ALIM).map(c => c.titre).join(' | '))
  v('🔴 la copie emporte les deux circuits, et laisse la base mettre ses défauts absents',
    ['vente_jour', 'commande_active', 'commande_max_jour'].every(c => CHAMPS_COPIES.includes(c)))

  const bord = code('app/dashboard/ConfigDashboard.js')
  v('🔴 le formulaire refuse un réglage impossible, puis écrit les circuits par la règle partagée',
    /const refusB = avecCircuits \? refusCircuits\(form\) : null\s*if \(refusB\) return toast\(refusB, 'error'\)/.test(bord)
    && /const circuits = avecCircuits \? champsCircuits\(form\) : null/.test(bord) && /\.\.\.\(circuits \|\| \{\}\),/.test(bord))
  v('🔴 sans le jour même, aucune quantité n’est exigée', /const refusStock = form\.vendable && venteJour \? refusQuantite\(form\.stock_mode, form\.stock_jour\) : null/.test(bord))
  v('🔴 les deux sections existent, en cartes',
    /<ChoixCartes label="Se vend-il le jour même \?" choix=\{CHOIX_JOUR_MEME\}/.test(bord) && /<ChoixCartes label="Se prend-il sur commande \?" choix=\{CHOIX_SUR_COMMANDE\}/.test(bord))
  v('🔴 sur commande : seulement les délais d’au moins un jour', /choixDeDelai\(form\.delai_minutes\)\.filter\(m => m >= 1440\)/.test(bord))
  v('🔴 l’ancienne section du délai ne s’affiche plus en alimentaire', /\{!estVitrine && !deuxCircuits && form\.vendable && \(\s*<SectionFormulaire titre="Quand peut-on le commander \?"/.test(bord))
  v('🔴 choisir « Stock qui baisse » éteint « sur commande »', /\.\.\.\(deuxCircuits && c\.mode === 'magasin' \? \{ commande_active: false \} : \{\}\)/.test(bord))
  v('🔴 un nouvel article garde « demain commandable » (A + B J+1), comme la migration',
    /const demainCommandable = deuxCircuits && \(Number\(commercant\?\.horizon_commande\) \|\| 2\) >= 2/.test(bord)
    && /delai_minutes: demainCommandable \? 1440 : 0/.test(bord) && /commande_active: demainCommandable, commande_max_jour: ''/.test(bord))
  v('🔴 l’édition relit les trois colonnes', /vente_jour: a\.vente_jour !== false, commande_active: a\.commande_active === true, commande_max_jour: a\.commande_max_jour \?\? ''/.test(bord))
  v('🔴 le relevé du tableau de bord sépare A et B (created_at, jour belge)',
    /\.select\('id, date_commande, created_at'\)/.test(bord)
    && /const circuitDe = c => \(!deuxCircuits \|\| \(String\(c\.date_commande\)\.slice\(0, 10\) === aujourdhuiIso && jourBelgeDeCreation\(c\.created_at\) === aujourdhuiIso\)\) \? 'A' : 'B'/.test(bord)
    && /const cible = info\.circuit === 'A' \? map : mapB/.test(bord))
  v('🔴 le comptoir du jour ne liste que ce qui se vend le jour même',
    /modeStockDe\(a\) === 'jour' && \(!deuxCircuits \|\| a\.vente_jour !== false\)\)/.test(bord))
  v('🔴 la carte : B se lit à part, et sans le jour même ni pastille ni comptoir',
    /const venteJour = !deuxCircuits \|\| a\.vente_jour !== false/.test(bord) && /\{enB && \(\(\) => \{/.test(bord)
    && /\{parJours && venteJour && \(congeAuj \?/.test(bord) && /surCommande=\{commandesSurCommande\[a\.id\] \|\| \{\}\}/.test(bord))
}

console.log(`\nStock et vitrine : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
