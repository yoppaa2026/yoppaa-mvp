// BANC : lire un article sans l'ouvrir, et rester où l'on était.
//
// 🔴 CE QU'ON PROTÈGE (Alex, 25/09, capture à l'appui). « Quand un article
// contient un groupe, une variante, cela doit se voir depuis sa vignette, pour
// le moment il faut l'ouvrir pour le voir, ce n'est pas user friendly du
// tout. » Et : « quand on fait un refresh d'une page dans le tableau de bord,
// il faut rester sur cette même page ».
//
// ⚠️ LE PIRE CAS N'EST PAS UNE LIGNE MANQUANTE : c'est une ligne qui ANNONCE
// un contenu que l'article n'a pas, ou un nombre de combinaisons calculé qui
// ne correspond pas à ce qu'il verra en ouvrant.
//
//   npm run verif:apercu

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { apercuOptions, apercuVariantes, apercuContenu } from '../lib/catalogue-apercu.js'
import { lireSousOnglet, sousOngletValide, CLE_SOUS_ONGLET, CLE_SOUS_ONGLET_2 } from '../lib/onglet-url.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// ═══ 1) CE QUE LES OPTIONS DONNENT À LIRE ═════════════════════════════════
{
  const G = (n) => ({ valeurs: Array.from({ length: n }, (_, i) => ({ nom: `v${i}` })) })

  v('sans groupe, il n’y a rien à dire', apercuOptions([]) === null)
  v('une liste absente ne casse rien', apercuOptions(null) === null)

  // ⚠️ ON COMPTE LES DEUX NIVEAUX : « 2 groupes » ne dit pas si le client aura
  // deux choix ou vingt.
  v('un groupe et ses options se comptent',
    apercuOptions([G(3)]) === '1 groupe · 3 options', apercuOptions([G(3)]))
  v('plusieurs groupes s’additionnent',
    apercuOptions([G(3), G(6)]) === '2 groupes · 9 options', apercuOptions([G(3), G(6)]))
  v('le singulier est respecté',
    apercuOptions([G(1)]) === '1 groupe · 1 option', apercuOptions([G(1)]))

  // ⚠️ UN GROUPE VIDE EXISTE : créé puis jamais rempli. « 1 groupe · 0 option »
  // serait exact mais illisible ; on dit ce qui manque.
  v('un groupe sans option dit ce qui manque',
    apercuOptions([G(0)]) === '1 groupe, aucune option', apercuOptions([G(0)]))
}

// ═══ 2) CE QUE LES VARIANTES DONNENT À LIRE ═══════════════════════════════
{
  v('un article sans variantes ne dit rien',
    apercuVariantes({ gere_variantes: false }) === null)
  v('un article illisible non plus', apercuVariantes(null) === null)

  const tshirt = {
    gere_variantes: true,
    axe1_nom: 'Taille', axe1_valeurs: ['S', 'M', 'L'],
    axe2_nom: 'Couleur', axe2_valeurs: ['Noir', 'Blanc'],
  }
  v('les deux axes sont nommés et comptés',
    apercuVariantes(tshirt) === 'Taille (3) · Couleur (2)', apercuVariantes(tshirt))

  // 🔴 ON NE PROMET PAS UN NOMBRE DE COMBINAISONS : il se déduirait des axes
  // (3 × 2 = 6) mais le commerçant a pu en supprimer, et un chiffre calculé qui
  // ne correspond pas à ce qu'il voit en ouvrant est pire que rien.
  v('aucun nombre de combinaisons n’est promis',
    !/combinaison/.test(apercuVariantes(tshirt) || ''), apercuVariantes(tshirt))

  v('un seul axe suffit',
    apercuVariantes({ gere_variantes: true, axe1_nom: 'Taille', axe1_valeurs: ['S'] }) === 'Taille (1)')
  v('un axe sans valeur n’est pas affiché',
    apercuVariantes({ gere_variantes: true, axe1_nom: 'Taille', axe1_valeurs: ['S'], axe2_nom: 'Couleur', axe2_valeurs: [] }) === 'Taille (1)')
  // ⚠️ LA CASE COCHÉE SANS AUCUNE VALEUR est un état réel, et c'est justement
  // celui qu'il faut voir : il a commencé et n'a pas fini.
  v('une matrice commencée et vide se voit',
    apercuVariantes({ gere_variantes: true, axe1_valeurs: [] }) === 'Variantes à compléter',
    apercuVariantes({ gere_variantes: true, axe1_valeurs: [] }))
}

// ═══ 3) LA LIGNE DE LA VIGNETTE ═══════════════════════════════════════════
{
  const G = (n) => ({ valeurs: Array.from({ length: n }, () => ({})) })

  const avec = apercuContenu({ groupes: [G(4)] })
  v('ce qui existe se lit en clair', avec.texte === '1 groupe · 4 options' && avec.vide === false,
    JSON.stringify(avec))

  // ⚠️ « RIEN » EST UNE INFORMATION SUR CET ÉCRAN-LÀ : c'est même celle qu'on
  // vient chercher, quels articles ne sont pas encore réglés.
  const sans = apercuContenu({ groupes: [] })
  v('l’absence se dit aussi', sans.texte === 'Pas d’options', sans.texte)
  v('et elle est marquée comme telle', sans.vide === true)

  const varVide = apercuContenu({ variantes: true, article: { gere_variantes: false } })
  v('côté variantes, l’absence se dit avec ses mots',
    varVide.texte === 'Pas de variantes' && varVide.vide === true, JSON.stringify(varVide))
  const varPleine = apercuContenu({
    variantes: true,
    article: { gere_variantes: true, axe1_nom: 'Taille', axe1_valeurs: ['S', 'M'] },
  })
  v('et sa présence aussi', varPleine.texte === 'Taille (2)' && varPleine.vide === false,
    JSON.stringify(varPleine))
  v('un appel sans rien ne casse pas', apercuContenu().texte === 'Pas d’options')
}

// ═══ 4) RESTER OÙ L'ON ÉTAIT QUAND ON RECHARGE ════════════════════════════
{
  // ⚠️ SANS `window`, LA LECTURE REND LE DÉFAUT. Ce banc tourne sous Node : la
  // fonction doit s'y comporter, sinon elle casserait aussi au rendu serveur.
  v('sans navigateur, la lecture rend le défaut',
    lireSousOnglet(['a', 'b'], 'a') === 'a')

  // 🔴 ET LA VALIDATION SE MESURE À PART, parce que `lireSousOnglet` rend le
  // défaut avant même de lire quand il n'y a pas de navigateur : au banc, la
  // règle n'était donc jamais exercée. C'est le harnais qui l'a dit, en
  // laissant passer une mutation qui acceptait n'importe quoi.
  v('un sous-onglet connu de l’écran est accepté',
    sousOngletValide('lieux', ['fiche', 'lieux'], 'fiche') === 'lieux')
  // ⚠️ CHANGER D'ONGLET LAISSE UN `?sous=` qui ne veut plus rien dire là où on
  // arrive : l'onglet Rendez-vous chercherait « personnalisation », qui
  // n'existe pas chez lui, et n'afficherait rien du tout.
  v('un sous-onglet inconnu retombe sur le défaut',
    sousOngletValide('personnalisation', ['prestations', 'praticiens'], 'prestations') === 'prestations',
    String(sousOngletValide('personnalisation', ['prestations', 'praticiens'], 'prestations')))
  v('une adresse sans sous-onglet rend le défaut',
    sousOngletValide(null, ['a'], 'a') === 'a' && sousOngletValide('', ['a'], 'a') === 'a')
  v('une liste de valides absente ne laisse rien passer',
    sousOngletValide('x', null, 'a') === 'a')

  // 🔴 DEUX NIVEAUX, DEUX CLÉS. L'onglet « Carte » choisit entre Produits et
  // Abonnements ; DANS Produits, la carte choisit entre Articles, Catégories
  // et Personnalisation. Une seule clé, et le second écraserait le premier.
  v('les deux clés d’adresse sont distinctes',
    CLE_SOUS_ONGLET !== CLE_SOUS_ONGLET_2, `${CLE_SOUS_ONGLET}/${CLE_SOUS_ONGLET_2}`)

  const url = sansProse(readFileSync(new URL('../lib/onglet-url.js', import.meta.url), 'utf8'))
  // 🔴 `replaceState`, PAS `pushState` : parcourir trois sous-onglets d'un même
  // réglage n'est pas une navigation, et les empiler obligerait à appuyer trois
  // fois sur « Précédent » pour sortir d'un écran qu'on n'a jamais quitté.
  v('l’adresse se remplace, elle ne s’empile pas',
    /history\.replaceState/.test(url) && !/pushState/.test(url))
  // ⚠️ RIEN À ÉCRIRE, ON N'ÉCRIT PAS.
  v('une écriture identique est évitée',
    /if \(url\.toString\(\) === window\.location\.href\) return/.test(url))
  // ⚠️ LE BOUTON « PRÉCÉDENT » change l'adresse sans que React le sache.
  v('le retour arrière est écouté', /addEventListener\('popstate'/.test(url))
  v('et l’écouteur est retiré', /removeEventListener\('popstate'/.test(url))
  // 🔴 ON N'ÉCRIT PAS AVANT D'AVOIR LU : sinon le premier rendu écraserait le
  // sous-onglet demandé par l'adresse, et recharger ne servirait à rien.
  v('on ne réécrit pas avant d’avoir lu l’adresse',
    /if \(!pret\.current\) return/.test(url))
  // 🔴 LA LECTURE SE FAIT DANS UN EFFET : lire `window` au premier rendu ferait
  // diverger le rendu serveur du rendu client, et l'hydratation casserait.
  v('la lecture ne se fait pas dans l’état initial',
    /useState\(defaut\)/.test(url) && !/useState\(\(\) => lireSousOnglet/.test(url))
}

// ═══ 5) LE BRANCHEMENT, CÔTÉ ÉCRAN ════════════════════════════════════════
{
  const config = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))

  // 🔴 LES QUATRE SOUS-ONGLETS DU TABLEAU DE BORD, pas seulement celui de la
  // capture : quatre corrections séparées auraient divergé.
  v('les quatre écrans tiennent leur sous-onglet dans l’adresse',
    (config.match(/useSousOnglet\(/g) || []).length === 4,
    String((config.match(/useSousOnglet\(/g) || []).length))
  // ⚠️ ET CELUI QUI EST IMBRIQUÉ UTILISE L'AUTRE CLÉ.
  v('l’écran imbriqué utilise la seconde clé',
    /'personnalisation'\], 'articles', CLE_SOUS_ONGLET_2/.test(config))
  v('aucun sous-onglet du tableau de bord n’est resté sur un useState nu',
    !/const \[subTab, setSubTab\] = useState\(/.test(config)
      && !/const \[sousOnglet, setSousOnglet\] = useState\(/.test(config))

  // ─── LES VIGNETTES ───────────────────────────────────────────────────────
  //
  // 🔴 CHARGÉ UNE FOIS POUR TOUT LE CATALOGUE : quarante vignettes qui iraient
  // chercher leurs groupes, ce seraient quarante requêtes pour du texte.
  // ⚠️ TROIS LECTURES SEULEMENT, et chacune a sa raison : le parent pour tout
  // le catalogue, le panneau pour SON article, la duplication pour l'original.
  // La quatrième — le panneau qui relisait les groupes de toutes les cibles —
  // a été retirée : trois lectures de la même chose finissent par ne plus dire
  // la même chose, et c'est un panneau de copie qui se trompe de conflits.
  v('les groupes ne sont plus lus par article pour un panneau de copie',
    !/\.select\('article_id, nom'\)/.test(config))
  v('et le parent les charge pour tout le catalogue',
    /select\('id, article_id, nom, type, obligatoire, valeurs:article_options_valeurs\(\*\)'\)/.test(config))
  v('les conflits se lisent sur les groupes du parent',
    (config.match(/conflitsDeGroupe\([^)]*groupesParArticle\)/g) || []).length === 4,
    String((config.match(/conflitsDeGroupe\([^)]*groupesParArticle\)/g) || []).length))
  v('la bibliothèque consomme cette lecture au lieu de la refaire',
    /function BibliothequeGroupes\(\{ articles = \[\], toast, onApplique, tousLesGroupes = \[\], groupesParArticle = \{\} \}\)/.test(config))
  v('et le parent la lui passe',
    /tousLesGroupes=\{tousLesGroupes\} groupesParArticle=\{groupesParArticle\}/.test(config))

  // ⚠️ LA PHRASE VIENT DE LA RÈGLE, l'écran ne fait que la peindre.
  v('les deux vignettes appellent la règle',
    (config.match(/apercuContenu\(\{/g) || []).length === 2,
    String((config.match(/apercuContenu\(\{/g) || []).length))
  // ⚠️ SUR LA LISTE DE TOUS LES JOURS, on ne montre que ce qui existe : une
  // pastille « pas d'options » sur chaque article serait du bruit.
  v('la carte d’article se tait quand il n’y a rien',
    /if \(ap\.vide\) return null/.test(config))
  // 🔴 ET SUR L'ÉCRAN DE PERSONNALISATION, l'absence s'affiche : c'est la
  // question qu'on vient y poser.
  v('l’écran de personnalisation montre aussi l’absence',
    /color: ap\.vide \? '#9CA3AF' : T\.main/.test(config))
  // ⚠️ LA BONNE FAMILLE SELON LE MÉTIER : le détail et la vitrine ont des
  // variantes, l'alimentaire des options.
  v('la vignette choisit la bonne famille selon le métier',
    /variantes: variantesCategorie,/.test(config) && /variantes: estDetail \|\| estVitrine,/.test(config))
}

console.log(`\nLire un article sans l’ouvrir : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
