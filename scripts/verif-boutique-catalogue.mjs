// Banc du catalogue de la Boutique Yoppaa (24/08).
//
// POURQUOI CE BANC EXISTE : la gamme matériel et service a été entièrement
// retarifée le 24/08, et AUCUNE garde ne couvrait ce fichier. Des prix, des
// libellés et des catégories ont changé sans que rien ne rougisse. Un
// catalogue silencieux est exactement le genre d'endroit où une erreur reste
// des mois : personne ne relit une liste de constantes.
//
// Il vérifie le CODE (structure, unicité, cohérence) ET le COMPORTEMENT :
// les fonctions sont EXÉCUTÉES, jamais cherchées au mot.

import {
  SHOP_PRODUCTS,
  ENCODAGE_ARTICLE,
  COMPAT_IMPRESSION,
  classerProduitsParCategorie,
  produitParType,
  prixProduitTexte,
} from '../lib/produits-boutique.js'

import { readFileSync } from 'node:fs'

let ok = 0
const echecs = []
function v(nom, cond) {
  if (cond) ok++
  else echecs.push(nom)
}

// ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE. Une garde verte
// grâce au commentaire qui EXPLIQUE la règle est le piège le plus fréquent de
// ce dépôt : le code peut disparaître, la phrase reste, et le banc applaudit.
function lireCode(chemin) {
  return readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Structure : tout produit doit être vendable
// ─────────────────────────────────────────────────────────────────────────

const CHAMPS = ['type', 'envKey', 'label', 'prix', 'desc', 'badge', 'badgeColor', 'categories']
for (const p of SHOP_PRODUCTS) {
  for (const champ of CHAMPS) {
    v(`${p.type} porte ${champ}`, p[champ] !== undefined && p[champ] !== null && p[champ] !== '')
  }
  v(`${p.type} a un prix strictement positif`, typeof p.prix === 'number' && p.prix > 0)
  v(`${p.type} a au moins une catégorie`, Array.isArray(p.categories) && p.categories.length > 0)
}

// ⚠️ DEUX PRODUITS QUI PARTAGENT UN envKey PARTAGENT LE MÊME PRICE STRIPE :
// le commerçant paierait le prix de l'autre, silencieusement, et Stripe aurait
// raison contre l'écran. C'est la garde la plus importante du fichier.
const envKeys = SHOP_PRODUCTS.map(p => p.envKey)
v('aucun envKey en double', new Set(envKeys).size === envKeys.length)
const types = SHOP_PRODUCTS.map(p => p.type)
v('aucun type en double', new Set(types).size === types.length)

// L'envKey sert à bâtir STRIPE_PRICE_<envKey>_TEST : tout caractère hors
// [A-Z0-9_] donnerait un nom de variable impossible à poser sur Vercel.
for (const p of SHOP_PRODUCTS) {
  v(`envKey de ${p.type} utilisable comme variable d'environnement`, /^[A-Z0-9_]+$/.test(p.envKey))
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Les prix arrêtés avec Alex le 24/08
// ─────────────────────────────────────────────────────────────────────────

const PRIX_ARRETES = {
  success_pack: 199,
  success_pack_kit: 259,
  mise_en_route: 59,
  kit_pro: 469,
  kit_light: 259,
  rouleau_etiquettes: 47.90,
}
for (const [type, prix] of Object.entries(PRIX_ARRETES)) {
  const p = produitParType(type)
  v(`${type} existe au catalogue`, !!p)
  v(`${type} vaut ${prix}€`, p?.prix === prix)
}
v('le catalogue ne compte pas de produit inattendu', SHOP_PRODUCTS.length === Object.keys(PRIX_ARRETES).length)

// ⚠️ L'ENCODAGE D'ARTICLES N'A PAS DE CARTE, ET C'EST VOLONTAIRE. Ce n'est
// pas le métier de Yoppaa : un produit mis en vitrine attire ceux qui le
// veulent. Il vit en mention du Success Pack, sur demande.
v("l'encodage d'articles n'est pas un produit du catalogue",
  !SHOP_PRODUCTS.some(p => /encodage/i.test(p.type) || /encodage/i.test(p.label)))
v('le tarif sans photo est le moins cher des deux', ENCODAGE_ARTICLE.sansPhoto < ENCODAGE_ARTICLE.avecPhoto)
v('les deux tarifs d\'encodage sont positifs', ENCODAGE_ARTICLE.sansPhoto > 0 && ENCODAGE_ARTICLE.avecPhoto > 0)

// ─────────────────────────────────────────────────────────────────────────
// 3. Cohérence de la gamme
// ─────────────────────────────────────────────────────────────────────────

v('le Kit Pro coûte plus cher que le Kit Light',
  produitParType('kit_pro').prix > produitParType('kit_light').prix)
v('le Success Pack avec installation coûte plus cher que sans',
  produitParType('success_pack_kit').prix > produitParType('success_pack').prix)
// La mise en route à distance ne doit jamais dépasser l'écart facturé pour la
// même prestation faite sur place : le commerçant y verrait une punition.
v('la mise en route à distance reste sous le prix du Success Pack',
  produitParType('mise_en_route').prix < produitParType('success_pack').prix)

// ─────────────────────────────────────────────────────────────────────────
// 4. Les textes, un par un, parce qu'ils ont TOUS menti à un moment
// ─────────────────────────────────────────────────────────────────────────

// ⚠️ LE DÉTAIL VIT DANS `contenu`, PAS DANS `desc`. Une phrase de résumé
// donne envie, elle ne fait jamais décider : « imprimante + rouleaux » ne dit
// ni combien, ni pour combien de temps, ni ce qui est fait avant l'envoi.
// Toute garde de texte doit donc lire les DEUX, sinon elle verdit sur un
// détail qui a simplement changé de champ.
const texteComplet = p => `${p.label} ${p.desc} ${(p.contenu || []).join(' ')} ${p.mention || ''}`
const tout = SHOP_PRODUCTS.map(texteComplet).join(' ')

for (const p of SHOP_PRODUCTS) {
  v(`${p.type} détaille son contenu`, Array.isArray(p.contenu) && p.contenu.length >= 3)
  v(`${p.type} n'a aucune ligne de contenu vide`,
    (p.contenu || []).every(l => typeof l === 'string' && l.trim().length > 0))
  v(`${p.type} porte une mention`, typeof p.mention === 'string' && p.mention.trim().length > 0)
}

// ⚠️ « tickets de commande » : la QL-820NWB imprime des ÉTIQUETTES sur bande
// de 62 mm, pas des tickets de caisse. Le mot promettait un autre appareil.
v('aucun texte ne promet des tickets', !/ticket/i.test(tout))
// ⚠️ « plug-and-play livrée prête à l'emploi » : le Wi-Fi est chez le
// commerçant, on ne peut rien y connecter depuis ici.
v('aucun texte ne promet du plug-and-play', !/plug.?and.?play/i.test(tout))
// ⚠️ « setup complet de ton menu » : chèque en blanc, et perte sèche dès le
// premier catalogue fourni.
v('aucun texte ne promet un setup complet', !/setup complet/i.test(tout))
// ⚠️ Le suivi à J+30 promettait un rappel que rien n'envoie.
v('aucun texte ne promet un suivi à J+30', !/J\+30/i.test(tout))

// ⚠️ LE SINGULIER ÉTAIT INDÉFENDABLE : « Rouleau d'étiquettes » à 44,90 € se
// comparait à un rouleau d'origine trouvable autour de 20 €.
const rouleau = produitParType('rouleau_etiquettes')
v('le pack de rouleaux annonce sa quantité dans son libellé', /8 rouleaux/i.test(rouleau.label))

// ⚠️ TROIS PRODUITS PARTENT PAR COLIS et le port est DANS le prix : ne pas le
// dire, c'est laisser croire à des frais de livraison au moment de payer.
for (const type of ['kit_pro', 'kit_light', 'rouleau_etiquettes']) {
  v(`${type} annonce la livraison comprise`, /livraison comprise/i.test(texteComplet(produitParType(type))))
}

// Les deux kits doivent DIRE qu'ils contiennent les rouleaux, sinon le
// commerçant les recommande le lendemain de sa livraison.
for (const type of ['kit_pro', 'kit_light']) {
  v(`${type} annonce ses 8 rouleaux`, /8 rouleaux/i.test(texteComplet(produitParType(type))))
}

// Le Success Pack dit ce qu'il contient, chiffres compris : c'est cette borne
// qui le sépare d'un travail d'opérateur de saisie sans fin.
const sp = produitParType('success_pack')
v('le Success Pack borne le nombre de photos', /10 photos/i.test(texteComplet(sp)))
v('le Success Pack borne le nombre d\'articles', /10 articles/i.test(texteComplet(sp)))
// ⚠️ GARDE MESURÉE MUETTE À LA MUTATION : le rayon figure DEUX FOIS, dans le
// contenu et dans la mention. Retirer celui de la mention laissait le banc
// vert grâce à l'autre. Les deux emplacements sont exigés séparément, parce
// qu'ils ne servent pas au même moment : la liste informe avant l'achat, la
// mention accompagne le produit partout où il s'affiche.
v('le rayon de 30 km figure dans le détail du Success Pack',
  (sp.contenu || []).some(l => /30 km/i.test(l)))
v('le rayon de 30 km figure aussi dans la mention', /30 km/i.test(sp.mention || ''))
// ⚠️ Le temps sur place n'était nulle part, et c'est lui qui décide de la
// marge : sans borne écrite, la visite s'étire et la prestation passe à perte.
v('le Success Pack borne son temps sur place', /2 heures/i.test(texteComplet(sp)))

// La mise en route dit sa durée, sinon une visio d'une heure et demie se
// facture 59 €.
const mer = produitParType('mise_en_route')
v('la mise en route annonce sa durée', /30 minutes/i.test(texteComplet(mer)))
// Le libellé doit nommer le matériel concerné : « le kit » seul laissait
// croire que la prestation ne couvrait pas une imprimante achetée seule.
v('la mise en route nomme le hardware', /hardware/i.test(mer.label))
v('la mise en route couvre tablette ET imprimante', /tablette/i.test(texteComplet(mer)) && /imprimante/i.test(texteComplet(mer)))
// ⚠️ Le réseau du commerçant est le seul point qu'on ne voit pas d'ici : la
// porte de sortie s'annonce AVANT, jamais pendant.
v('la mise en route nomme la porte de sortie', /déplacement/i.test(mer.mention || ''))

// ─────────────────────────────────────────────────────────────────────────
// La double vérité de la compatibilité (Alex, 24/08)
// ─────────────────────────────────────────────────────────────────────────

// ⚠️ DEUX PHRASES OPPOSÉES, TOUTES DEUX VRAIES : Yoppaa Pro tourne partout
// (c'est une PWA), l'IMPRESSION n'est garantie qu'avec le modèle fourni.
// Dire l'une sans l'autre trompe par omission.
v('la phrase de compatibilité nomme les trois plateformes',
  /iPhone/i.test(COMPAT_IMPRESSION) && /Android/i.test(COMPAT_IMPRESSION) && /PC/.test(COMPAT_IMPRESSION))
v('la phrase de compatibilité nomme la marque de l\'imprimante', /Brother/i.test(COMPAT_IMPRESSION))
// ⚠️ « GARANTIE », JAMAIS « COMPATIBLE ». La limite est contractuelle, pas
// technique : une imprimante identique achetée ailleurs fonctionnerait
// probablement, et écrire « incompatible » serait un mensonge vérifiable en
// dix minutes par le premier commerçant qui essaie.
v('la limite est dite comme une garantie, pas comme une impossibilité',
  /garanti/i.test(COMPAT_IMPRESSION) && !/incompatible/i.test(COMPAT_IMPRESSION))

// Elle doit figurer sur les trois produits qui impriment, sans être recopiée.
for (const type of ['kit_pro', 'kit_light', 'rouleau_etiquettes']) {
  v(`${type} porte la phrase de compatibilité`,
    (produitParType(type).mention || '').includes(COMPAT_IMPRESSION))
}
// Et l'argument de l'inscription ne doit plus promettre « n'importe quel
// appareil » sans nommer la limite d'impression.
v("l'argument de compatibilité de l'inscription nomme la limite d'impression",
  /Brother fourni par Yoppaa/.test(lireCode('app/signup/page.js')))

// Les deux services liés au matériel refusent le matériel d'ailleurs.
v('le Success Pack avec kit exige un Kit Yoppaa',
  /Kit Yoppaa/i.test(produitParType('success_pack_kit').mention || ''))
v('la mise en route exige un Kit Yoppaa', /Kit Yoppaa/i.test(mer.mention || ''))

// ─────────────────────────────────────────────────────────────────────────
// 5. Aucun prix recopié dans un texte
// ─────────────────────────────────────────────────────────────────────────

// ⚠️ UN PRIX ÉCRIT DEUX FOIS EST UN PRIX QUI DIVERGERA. Seuls les tarifs
// d'encodage ont le droit d'apparaître dans un texte, et ils y sont
// INTERPOLÉS depuis ENCODAGE_ARTICLE, jamais tapés.
const prixDuCatalogue = SHOP_PRODUCTS.map(p => p.prix)
for (const p of SHOP_PRODUCTS) {
  const texte = `${p.desc} ${(p.contenu || []).join(' ')} ${p.mention || ''}`
  const montants = [...texte.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*€/g)].map(m => Number(m[1].replace(',', '.')))
  const interdits = montants.filter(m => prixDuCatalogue.includes(m))
  v(`${p.type} ne recopie aucun prix du catalogue dans son texte`, interdits.length === 0)
}
// Et la mention du Success Pack doit vraiment porter les valeurs vivantes.
v('la mention du Success Pack porte le tarif sans photo en vigueur',
  (sp.mention || '').includes(`${ENCODAGE_ARTICLE.sansPhoto}€`))
v('la mention du Success Pack porte le tarif avec photo en vigueur',
  (sp.mention || '').includes(`${ENCODAGE_ARTICLE.avecPhoto}€`))

// ─────────────────────────────────────────────────────────────────────────
// 6. Le matériel s'ouvre au détail, pas qu'à l'alimentaire
// ─────────────────────────────────────────────────────────────────────────

// ⚠️ FERMÉS À `alimentaire`, LES TROIS PRODUITS MATÉRIELS ÉTAIENT INVISIBLES
// pour un salon ou une boutique, alors que l'étiquette sert justement aux
// produits d'un rendez-vous et d'une commande de détail.
for (const type of ['kit_pro', 'kit_light', 'rouleau_etiquettes']) {
  v(`${type} est proposé au détail`, produitParType(type).categories.includes('detail'))
}
// Les services humains valent pour les trois métiers.
for (const type of ['success_pack', 'success_pack_kit', 'mise_en_route']) {
  const cats = produitParType(type).categories
  v(`${type} couvre les trois catégories`,
    ['alimentaire', 'vitrine', 'detail'].every(c => cats.includes(c)))
}

// ─────────────────────────────────────────────────────────────────────────
// 7. COMPORTEMENT : les fonctions sont exécutées
// ─────────────────────────────────────────────────────────────────────────

for (const cat of ['alimentaire', 'vitrine', 'detail']) {
  const { principaux, secondaires } = classerProduitsParCategorie(cat)
  // Aucun produit ne doit disparaître du classement : ni compté deux fois, ni
  // perdu. C'est la seule chose qui garantit qu'un commerçant les voit tous.
  v(`${cat} : aucun produit perdu au classement`,
    principaux.length + secondaires.length === SHOP_PRODUCTS.length)
  v(`${cat} : aucun produit dans les deux listes`,
    principaux.every(p => !secondaires.some(s => s.type === p.type)))
  v(`${cat} : au moins un produit principal`, principaux.length > 0)
}

// Une catégorie inconnue ne doit pas faire disparaître le catalogue : tout
// bascule en secondaire, et le commerçant voit quand même quelque chose.
const inconnue = classerProduitsParCategorie('categorie_qui_nexiste_pas')
v('catégorie inconnue : rien ne se perd',
  inconnue.principaux.length === 0 && inconnue.secondaires.length === SHOP_PRODUCTS.length)

v('produitParType rend null sur un type inconnu', produitParType('nawak') === null)
v('produitParType rend le bon produit', produitParType('kit_light')?.label === 'Kit Yoppaa Light')

// prixProduitTexte : un entier n'affiche pas de décimales, un prix à virgule
// les garde, et la virgule est FRANÇAISE.
v('prixProduitTexte rend 259€ sur un prix entier', prixProduitTexte('kit_light') === '259€')
v('prixProduitTexte rend 469€ sur le Kit Pro', prixProduitTexte('kit_pro') === '469€')
v('prixProduitTexte rend 47,90€ avec une virgule', prixProduitTexte('rouleau_etiquettes') === '47,90€')
v('prixProduitTexte ne rend jamais de point décimal', !prixProduitTexte('rouleau_etiquettes').includes('.'))
v('prixProduitTexte rend une chaîne vide sur un type inconnu', prixProduitTexte('nawak') === '')

// ─────────────────────────────────────────────────────────────────────────
// 8. Les écrans montrent vraiment ce que le catalogue porte
// ─────────────────────────────────────────────────────────────────────────

// Un champ ajouté au catalogue et jamais rendu, c'est du travail invisible :
// le détail des packs existerait en base et nulle part à l'écran.
const signup = lireCode('app/signup/page.js')
// ⚠️ GARDE MESURÉE MUETTE À LA MUTATION : chercher `produit.contenu` restait
// vert quand la CONDITION d'affichage était neutralisée, parce que le `.map`
// juste en dessous contient le même mot. Une garde qui cherche un MOT verdit
// sur n'importe lequel de ses usages. On exige les DEUX morceaux du rendu :
// le test qui décide d'afficher, et la boucle qui affiche.
v("l'inscription teste la présence du détail avant de l'afficher",
  /Array\.isArray\(produit\.contenu\)\s*&&\s*produit\.contenu\.length/.test(signup))
v("l'inscription parcourt bien le détail", /produit\.contenu\.map\(/.test(signup))
// ⚠️ La mention ne s'affichait QUE sur les produits secondaires. Elle porte
// désormais le rayon de 30 km et l'exigence d'un Kit Yoppaa : cachée sur un
// produit principal, elle laissait acheter une prestation sans ses limites.
v("l'inscription rend la mention sans la réserver aux produits secondaires",
  /\{produit\.mention && \(/.test(signup))
v("l'inscription ne recopie plus les prix des kits",
  /prixProduitTexte\('kit_pro'\)/.test(signup) && /prixProduitTexte\('kit_light'\)/.test(signup))
// ⚠️ Alex, 24/08 : le commerçant doit savoir à l'inscription que rien n'est
// perdu s'il passe l'étape. Sans cette phrase, l'écran ressemble à une vente
// forcée au pire moment du parcours.
v("l'inscription dit que tout reste disponible depuis le tableau de bord",
  /reste disponible dans ton\s*\n?\s*tableau de bord/.test(signup) || /tableau de bord, onglet Boutique/.test(signup))

const dash = lireCode('app/dashboard/ConfigDashboard.js')
// Même piège, même remède qu'à l'inscription.
v('le tableau de bord teste la présence du détail avant de l\'afficher',
  /Array\.isArray\(p\.contenu\)\s*&&\s*p\.contenu\.length/.test(dash))
v('le tableau de bord parcourt bien le détail', /p\.contenu\.map\(/.test(dash))
// ⚠️ La mention y était aussi réservée aux produits secondaires.
v('le tableau de bord rend la mention sans la réserver aux secondaires',
  /\{p\.mention && \(/.test(dash))

// ─────────────────────────────────────────────────────────────────────────
// 9. Les CGU couvrent ce que Yoppaa vend en son nom propre
// ─────────────────────────────────────────────────────────────────────────

// ⚠️ AVANT LE 24/08, /legal NE PARLAIT NI DU MATÉRIEL NI DES PRESTATIONS.
// Aucune occurrence de « Kit », « imprimante » ou « garantie » pendant que la
// boutique encaissait des kits à plusieurs centaines d'euros.
const legal = lireCode('app/legal/page.js')
v('les CGU ouvrent une section Boutique', /Boutique Yoppaa\s*:\s*matériel et prestations/.test(legal))
// Le point le plus important : sans clause écrite, c'est le droit commun des
// vices cachés qui s'applique, plus flou que ce qu'on croit.
v('les CGU disent que le Commerçant n\'est pas un consommateur',
  /qualité de consommateur/.test(legal) && /rétractation de 14 jours ne s/.test(legal))
v('les CGU nomment la garantie du fabricant', /garantie commerciale du fabricant/.test(legal))
v('les CGU posent le paiement préalable', /qu&rsquo;après encaissement intégral/.test(legal))
v('les CGU fixent le transfert des risques', /risques sont transférés/.test(legal))
v('les CGU bornent le rayon des prestations sur site', /rayon de 30 km/.test(legal))
v('les CGU refusent le matériel acquis auprès d\'un tiers', /matériel acquis auprès d&rsquo;un tiers/.test(legal))
// ⚠️ Les prix des kits ne doivent pas être RECOPIÉS dans le document
// contractuel : c'est lui qui aurait tort face à l'écran de vente.
v('les CGU lisent la gamme dans le catalogue, sans la recopier',
  /SHOP_PRODUCTS\.map/.test(legal) && /prixProduitTexte\(p\.type\)/.test(legal))
// ⚠️ GARDE MESURÉE MUETTE : chercher `COMPAT_IMPRESSION` restait vert quand
// le paragraphe disparaissait, parce que la LIGNE D'IMPORT porte le même mot.
// Deuxième fois que ce motif exact passe aujourd'hui. On exige le rendu.
v('les CGU reprennent la clause de compatibilité du catalogue',
  /<P>\{COMPAT_IMPRESSION\}<\/P>/.test(legal))

// ─────────────────────────────────────────────────────────────────────────

console.log('')
if (echecs.length) {
  console.log(`${ok} vérifications passées, ${echecs.length} en ÉCHEC :`)
  for (const e of echecs) console.log(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`${ok} vérifications passées, 0 en échec.`)
console.log('Catalogue de la boutique vert.')
