// COPIER DANS LE CATALOGUE, AU LIEU DE TOUT RÉÉCRIRE.
//
// 🔴 POURQUOI (Alex, 25/09). « Une liste complète de sauces, des garnitures de
// pizza ne peuvent pas être réécrites sur 40 pizzas différentes. » En base, un
// groupe d'options porte un `article_id` : il APPARTIENT à un article. Quarante
// pizzas veulent donc dire quarante groupes et quarante fois la même liste,
// saisie à la main, une valeur après l'autre.
//
// ⚠️ CE MODULE NE RÈGLE QUE LA CRÉATION, ET IL FAUT LE SAVOIR. Le jour où le
// commerçant ajoute une sauce, il la rajoute sur chaque article. La réponse
// définitive est une bibliothèque de groupes partagés, décidée plus tard : elle
// demande une migration et touche les deux validations serveur qui vérifient
// qu'une option appartient bien à l'article commandé (`create-commande` et
// `create-rdv-commande`). Copier ne ferme pas cette porte : dupliquer restera
// utile pour fabriquer une variante d'un groupe partagé.
//
// ⚠️ TOUT EST PUR ICI. Aucune écriture, aucun accès à Supabase : l'écran
// compose, ce module décide. C'est ce qui permet de le mesurer.

// ─── CE QU'UNE COPIE D'ARTICLE EMPORTE ──────────────────────────────────────
//
// 🔴 UNE LISTE EXPLICITE, JAMAIS UN ÉTALEMENT DE L'ARTICLE. `{ ...article }`
// recopierait `id`, `created_at` et tout ce que la table gagnera un jour :
// l'insertion partirait avec l'identifiant de l'original, ou échouerait sur
// une colonne générée. On nomme donc ce qu'on copie, et une garde du banc
// compare cette liste au formulaire d'enregistrement pour que l'oubli d'une
// colonne future se voie.
export const CHAMPS_COPIES = [
  'nom', 'description', 'prix', 'stock_jour', 'actif', 'categorie',
  'temps_prepa', 'delai_minutes', 'photo_url', 'est_vitrine',
  'tva_taux', 'tva_taux_sur_place',
]

// ─── ET LES AXES DE VARIANTES, QUI N'ONT PAS DE FORMULAIRE ──────────────────
//
// 🔴 LE TROU DU 25/09, TROUVÉ PAR ALEX (« cette modif s'applique à tous les
// catalogues ? »). Ces cinq colonnes vivent bien sur `articles`, mais elles ne
// passent PAS par le formulaire d'enregistrement : c'est l'écran des variantes
// qui les écrit à part. Dupliquer un t-shirt rendait donc une fiche nue, sans
// même la définition de ses axes — et le geste qui compte le plus pour une
// boutique était justement celui-là.
//
// ⚠️ ELLES SONT SÉPARÉES POUR QUE LEUR GARDE LE SOIT AUSSI. La parité des
// champs se mesure contre LEUR source : le formulaire pour les uns, le
// `select` de l'écran des variantes pour les autres. Une garde qui ne connaît
// qu'une source déclare complet ce qui est à moitié copié, et c'est exactement
// ce qui vient d'arriver.
export const CHAMPS_VARIANTES = [
  'gere_variantes', 'axe1_nom', 'axe1_valeurs', 'axe2_nom', 'axe2_valeurs',
]

// ─── LE NOM DE LA COPIE ─────────────────────────────────────────────────────
//
// ⚠️ DEUX ARTICLES AU MÊME NOM SONT UN PIÈGE, PAS UNE ERREUR DE BASE. Rien
// n'interdit le doublon en base, mais le commerçant qui voit deux
// « Margherita » dans sa liste ne sait plus laquelle il modifie, et son client
// non plus. On suffixe donc, et on compte tant que le nom est pris.
//
// ⚠️ ON COMPARE SANS LA CASSE NI LES ESPACES DE BORD, parce que « margherita »
// et « Margherita  » sont le même nom pour l'œil, et c'est l'œil qu'on protège.
export function nomDeLaCopie(nom, nomsExistants = []) {
  const base = String(nom || '').trim() || 'Article'
  const pris = new Set(
    (Array.isArray(nomsExistants) ? nomsExistants : [])
      .map(n => String(n || '').trim().toLowerCase())
  )
  const candidat = `${base} (copie)`
  if (!pris.has(candidat.toLowerCase())) return candidat
  // On s'arrête à 99 : au-delà, ce n'est plus une copie, c'est un symptôme.
  for (let i = 2; i <= 99; i++) {
    const essai = `${base} (copie ${i})`
    if (!pris.has(essai.toLowerCase())) return essai
  }
  return `${base} (copie)`
}

/**
 * Le contenu à insérer pour dupliquer un article.
 *
 * 🔴 LA COPIE NAÎT INDISPONIBLE, et c'est une décision, pas une prudence
 * gratuite. Dupliquer sert à préparer : un article qui apparaîtrait aussitôt
 * dans la fiche publique, au nom de son voisin et au prix de son voisin,
 * serait une promesse faite au client avant que le commerçant ait relu quoi
 * que ce soit. Il l'active quand elle est prête.
 *
 * ⚠️ LA PHOTO SE PARTAGE, ELLE NE SE RECOPIE PAS. On reprend l'adresse du
 * fichier, pas le fichier : supprimer un article n'efface aucune image dans le
 * stockage, les deux fiches peuvent donc pointer la même sans danger.
 *
 * @returns un objet prêt pour `insert`, ou `null` si l'article est illisible.
 */
export function copieDArticle(article, { commercantId, nomsExistants = [] } = {}) {
  if (!article || typeof article !== 'object') return null
  const sortie = {}
  for (const champ of CHAMPS_COPIES) sortie[champ] = article[champ] ?? null
  // ⚠️ LES AXES SUIVENT L'ARTICLE, sinon une boutique duplique un t-shirt et
  // récupère une fiche sans tailles ni couleurs.
  for (const champ of CHAMPS_VARIANTES) {
    if (article[champ] !== undefined) sortie[champ] = article[champ]
  }
  sortie.nom = nomDeLaCopie(article.nom, nomsExistants)
  sortie.actif = false
  if (commercantId) sortie.commercant_id = commercantId
  return sortie
}

/**
 * Les combinaisons de variantes à recréer sur la copie.
 *
 * 🔴 LE STOCK NE SE COPIE PAS, ET C'EST LE SEUL CHAMP DANS CE CAS. Un prix,
 * une photo, un ordre sont des réglages : ils décrivent l'article. « 12 en
 * taille M » est une QUANTITÉ, elle décrit un carton dans l'arrière-boutique.
 * La recopier vendrait douze t-shirts qui n'existent pas, et le commerçant ne
 * le verrait qu'à la première commande. Les nouvelles combinaisons partent
 * donc à zéro, exactement comme quand il les crée à la main.
 *
 * ⚠️ `actif` SE COPIE, LUI : c'est le commerçant qui a décidé que le 3XL ne se
 * vend plus, et il n'a pas envie de le redécider.
 */
export function copiesDeVariantes(variantes = [], articleId) {
  if (!articleId) return []
  return (Array.isArray(variantes) ? variantes : []).map((v, i) => ({
    article_id: articleId,
    axe1_valeur: v?.axe1_valeur ?? null,
    axe2_valeur: v?.axe2_valeur ?? null,
    prix: v?.prix === undefined ? null : v.prix,
    photo_url: v?.photo_url ?? null,
    actif: v?.actif !== false,
    ordre: Number.isFinite(Number(v?.ordre)) ? Number(v.ordre) : i,
    stock: 0,
  }))
}

// ─── VERS QUELS ARTICLES PEUT-ON COPIER UN GROUPE ? ─────────────────────────
//
// ⚠️ UN ARTICLE DE VITRINE NE SE COMMANDE PAS, donc ses options ne seraient
// jamais proposées à personne. Le lui proposer ferait croire à un réglage qui
// n'a aucun effet, et c'est exactement le genre de bouton mort qui fait douter
// du reste de l'écran.
export function ciblesDeCopie(articles = [], sourceId = null) {
  const liste = Array.isArray(articles) ? articles : []
  return liste.filter(a => (
    a && String(a.id) !== String(sourceId) && a.est_vitrine !== true
  ))
}

// ─── CE QUI EST DÉJÀ LÀ, ET QU'ON NE REMPLACE PAS EN SILENCE ────────────────
//
// 🔴 LE PIÈGE DE LA COPIE EST L'ÉCRASEMENT MUET. Le commerçant copie
// « Garnitures » vers trente pizzas ; trois l'avaient déjà, avec une valeur en
// plus qu'il avait ajoutée exprès. Remplacer sans rien dire les lui ferait
// perdre sans qu'il l'apprenne jamais. C'est la règle des créneaux, où
// « Copier vers… » demande avant de remplacer un jour déjà rempli.
//
// ⚠️ ON COMPARE LE NOM DU GROUPE, pas son contenu : c'est le nom que le
// commerçant lit, et deux groupes « Sauces » sur le même article ne sont
// jamais voulus — le client les verrait deux fois dans son tunnel.
//
// 🔴 ET CE QU'ON FAIT DES CONFLITS EST TRANCHÉ ICI : ON LES ÉCARTE. Remplacer
// supprimerait un groupe existant et toutes ses valeurs, y compris celles que
// le commerçant avait ajoutées exprès sur cette pizza-là ; ajouter en double
// donnerait deux « Sauces » au client. Passer l'article et le DIRE laisse le
// commerçant aller voir, et ne détruit rien.
//
// @param groupesParArticle { [articleId]: [{ nom }] }
// @returns les identifiants des articles qui portent déjà ce nom de groupe.
export function conflitsDeGroupe(nomGroupe, cibleIds = [], groupesParArticle = {}) {
  const nom = String(nomGroupe || '').trim().toLowerCase()
  if (!nom) return []
  return (Array.isArray(cibleIds) ? cibleIds : []).filter(id => {
    const groupes = groupesParArticle?.[id] || groupesParArticle?.[String(id)] || []
    return groupes.some(g => String(g?.nom || '').trim().toLowerCase() === nom)
  })
}

/**
 * Le groupe et ses valeurs, prêts à être écrits sur chaque article visé.
 *
 * ⚠️ LES VALEURS VOYAGENT AVEC LE GROUPE, sinon on copie une liste vide et le
 * commerçant croit avoir tout transporté. Elles sont rendues à part parce que
 * leur `groupe_id` n'existera qu'après l'insertion du groupe : c'est l'écran
 * qui les rattache, ce module ne connaît aucun identifiant futur.
 *
 * ⚠️ `prix_supplement` SUIT LA VALEUR. Une sauce à 0,50 € copiée à zéro se
 * vendrait gratuitement sur trente-neuf pizzas, et personne ne s'en
 * apercevrait avant la comptabilité.
 *
 * @returns { groupes: [{ article_id, nom, type, obligatoire }], valeurs: [[{ nom, prix_supplement }]] }
 *          Les deux tableaux sont alignés : `valeurs[i]` appartient à `groupes[i]`.
 */
export function copiesDuGroupe(groupe, cibleIds = []) {
  const vide = { groupes: [], valeurs: [] }
  if (!groupe || !Array.isArray(cibleIds) || cibleIds.length === 0) return vide

  const valeursSource = Array.isArray(groupe.valeurs) ? groupe.valeurs : []
  const groupes = []
  const valeurs = []
  for (const id of cibleIds) {
    if (id == null) continue
    groupes.push({
      article_id: id,
      nom: String(groupe.nom || '').trim(),
      // ⚠️ LE TYPE ET L'OBLIGATION FONT PARTIE DU GROUPE. Copier « choix
      // unique » en « plusieurs » laisserait un client prendre trois tailles
      // de pizza, et le commerçant découvrirait la commande au comptoir.
      type: groupe.type === 'multiple' ? 'multiple' : 'unique',
      obligatoire: groupe.obligatoire === true,
    })
    valeurs.push(valeursSource.map(v => ({
      nom: String(v?.nom || '').trim(),
      prix_supplement: Number(v?.prix_supplement) || 0,
    })))
  }
  return { groupes, valeurs }
}

// ─── CE QU'IL RESTE À VÉRIFIER SUR UNE COPIE ────────────────────────────────
//
// 🔴 POURQUOI (Alex, 25/09). « Il faut juste une fenêtre qui explique ce qui
// n'est pas copié et la vérification nécessaire : copie dans le titre, photo
// secondaire non copiée, stock… S'il est informé c'est très bien. »
//
// ⚠️ ET C'EST LE BON ARBITRAGE. Tout copier n'est PAS toujours souhaitable :
// des photos secondaires qui montrent un autre produit, ou un stock hérité,
// seraient des erreurs plus difficiles à repérer qu'une case vide. Ce qui
// manquait n'était donc pas la copie, c'était de SAVOIR.
//
// 🔴 ET LA LISTE NE DIT QUE CE QUI EST VRAI POUR CET ARTICLE-LÀ. Une liste
// générique dont la moitié ne s'applique pas est une alarme qui sonne tout le
// temps : on cesse de la lire, et le jour où elle compte, elle ne sert plus.
// Une fiche sans photo secondaire ne lit pas une ligne sur les photos.

/**
 * Les points à relire sur une copie qui vient d'être créée.
 *
 * @param etat { nom, galerie, stocksJour, variantes, options, prestation }
 *        `galerie`, `stocksJour`, `variantes`, `options` sont des NOMBRES :
 *        combien l'original en portait. Zéro veut dire « rien à dire ».
 * @returns [{ quoi, faire }] — `quoi` décrit l'état, `faire` nomme le geste.
 */
export function aVerifierApresCopie({
  nom = '', galerie = 0, stocksJour = 0, variantes = 0, options = 0,
  prestation = false,
} = {}) {
  const points = []

  // ⚠️ TOUJOURS EN PREMIER : c'est le seul point qui est vrai à chaque fois, et
  // celui que le client verrait en premier si on l'oubliait.
  points.push({
    quoi: `Le nom porte « (copie) » : ${nom || 'la copie'}`,
    faire: 'Renomme-la avant de la rendre disponible.',
  })
  points.push({
    quoi: prestation ? 'Elle est en indisponible' : 'Il est en indisponible',
    faire: prestation
      ? 'Personne ne peut la réserver tant que tu ne l’as pas activée.'
      : 'Personne ne le voit sur ta fiche tant que tu ne l’as pas activé.',
    court: 'en indisponible',
  })

  if (galerie > 0) {
    points.push({
      quoi: galerie === 1
        ? '1 photo supplémentaire n’a pas été reprise'
        : `${galerie} photos supplémentaires n’ont pas été reprises`,
      faire: 'La photo principale, elle, est là. Ajoute les autres si elles montrent le même produit.',
      court: galerie === 1 ? '1 photo non reprise' : `${galerie} photos non reprises`,
    })
  }
  if (variantes > 0) {
    // 🔴 LE STOCK DES VARIANTES REPART DE ZÉRO, et c'est le piège le plus cher
    // de cette liste : un article activé avec des tailles à zéro ne se vend
    // pas, et le commerçant cherche pourquoi. C'est le SEUL point qui mérite
    // d'arrêter le geste : les autres se voient à l'écran, celui-là non.
    points.push({
      quoi: variantes === 1
        ? '1 variante a été recréée, à stock zéro'
        : `${variantes} variantes ont été recréées, à stock zéro`,
      faire: 'Remets les quantités : tant qu’elles sont à zéro, rien ne se vend.',
      court: 'variantes à stock zéro',
      grave: true,
    })
  }
  if (stocksJour > 0) {
    points.push({
      quoi: 'Les stocks par jour de la semaine n’ont pas été repris',
      faire: 'Règle-les dans la fiche si cet article en a besoin.',
      court: 'stocks par jour non repris',
    })
  }
  if (options > 0) {
    // ⚠️ CELUI-LÀ EST UNE BONNE NOUVELLE, et il a sa place DANS LA FENÊTRE :
    // sans lui, le commerçant recrée ses groupes à la main sans avoir vérifié
    // qu'ils y sont déjà. Il n'a pas de version courte : un toast n'est pas
    // l'endroit pour rassurer, il est l'endroit pour alerter.
    points.push({
      quoi: options === 1
        ? '1 groupe d’options a bien suivi'
        : `${options} groupes d’options ont bien suivi`,
      faire: 'Rien à refaire de ce côté-là.',
    })
  }
  return points
}

// ─── QUINZE FOIS LA MÊME FENÊTRE N'EST PAS UNE INFORMATION ──────────────────
//
// 🔴 ALEX, 25/09 : « pas 15 fois la même chose s'il fait la manip sur 15
// articles, il faut réfléchir pour rendre ça agréable en toute circonstance. »
// Il a raison, et c'est la règle des confirmations du 08/09 vue d'un autre
// côté : douze fenêtres par jour deviennent un réflexe, et le jour où la
// fenêtre compte vraiment, plus personne ne la lit.
//
// ⚠️ LA FENÊTRE NE SE LÈVE QUE POUR CE QUI NE SE VOIT PAS À L'ÉCRAN. Le nom
// « (copie) » se lit dans la liste, la pastille « Inactif » aussi, les photos
// manquantes se voient en ouvrant la fiche. Les variantes à stock zéro, elles,
// ne se voient nulle part : l'article a l'air prêt, il s'active, et rien ne se
// vend. Celui-là mérite qu'on arrête le geste.
//
// ⚠️ ET UNE SEULE FOIS PAR SESSION : la deuxième duplication n'apprend rien de
// plus que la première. L'information passe alors dans le message court, qui
// ne bloque personne.

/** Faut-il arrêter le commerçant, ou lui glisser un mot ? */
export function doitOuvrirFenetre(points = [], dejaVue = false) {
  if (dejaVue) return false
  return (Array.isArray(points) ? points : []).some(p => p?.grave === true)
}

/**
 * Les points, une ligne par entrée, pour la fenêtre.
 *
 * ⚠️ UN TABLEAU, PAS UNE CHAÎNE. La modale sait déjà rendre une ligne par
 * entrée ; lui passer un texte collé donnait le pavé illisible qu'Alex a
 * montré en capture le 25/09. La puce est là pour l'œil qui balaie.
 */
export function lignesDeFenetre(points = []) {
  return (Array.isArray(points) ? points : []).map(p => `• ${p.quoi}. ${p.faire}`)
}

/**
 * Le message court, celui qui ne bloque pas.
 *
 * ⚠️ IL NE REPREND QUE CE QUI SE RETIENT : ce qu'on ne peut pas voir à
 * l'écran. Recopier les six lignes de la fenêtre dans un message qui dure
 * trois secondes ne servirait personne.
 */
export function resumeCourt(nom, points = []) {
  const quoi = nom ? `« ${nom} »` : 'La copie'
  const bouts = (Array.isArray(points) ? points : [])
    .map(p => p?.court)
    .filter(Boolean)
  if (bouts.length === 0) return `${quoi} créé.`
  return `${quoi} créé, ${bouts.join(' · ')}.`
}

// ─── ET LES PRESTATIONS, POUR LES MÉTIERS À RENDEZ-VOUS ─────────────────────
//
// 🔴 POURQUOI (Alex, 25/09). Un salon a trente prestations qui se ressemblent à
// deux mots près : coupe femme, coupe femme longue, coupe femme + brushing. Il
// les saisissait entièrement, une par une, avec leur durée, leur prix, leur
// acompte et leurs praticiens.
//
// ⚠️ UNE PRESTATION N'EST PAS UN ARTICLE, et deux champs le rappellent : la
// DURÉE, qui n'existe nulle part ailleurs, et l'ACOMPTE, qui touche à l'argent
// pris d'avance. Les copier est exactement ce qu'on veut ; les oublier
// donnerait une prestation de trente minutes sans acompte là où le commerçant
// en demandait un.
export const CHAMPS_PRESTATION = [
  'nom', 'description', 'duree_minutes', 'prix', 'acompte_pourcent', 'actif',
  'tva_taux', 'capacite', 'par_couverts', 'couverts_min', 'couverts_max',
  'duree_paliers', 'quantite',
]

/**
 * La copie d'une prestation, prête pour `insert`.
 *
 * 🔴 UNE JOINTURE DE TABLES NE SE DUPLIQUE PAS, et c'est un refus, pas un
 * oubli. Une jointure est une composition figée de tables réelles : en créer
 * une seconde sur les mêmes tables ferait compter deux fois le même inventaire,
 * et le service afficherait des places qui n'existent pas.
 *
 * ⚠️ ELLE NAÎT INDISPONIBLE, pour la même raison qu'un article : elle porte le
 * nom, la durée et le prix de sa voisine, et le client la verrait avant que le
 * commerçant l'ait relue.
 */
export function copieDePrestation(prestation, { commercantId, nomsExistants = [] } = {}) {
  if (!prestation || typeof prestation !== 'object') return null
  if (prestation.jointure_de) return null
  const sortie = {}
  for (const champ of CHAMPS_PRESTATION) sortie[champ] = prestation[champ] ?? null
  sortie.nom = nomDeLaCopie(prestation.nom, nomsExistants)
  sortie.actif = false
  if (commercantId) sortie.commercant_id = commercantId
  return sortie
}

// ─── LE MÊME GESTE POUR LES VARIANTES ───────────────────────────────────────
//
// 🔴 POURQUOI (Alex, 25/09) : « faciliter la création des catalogues, cartes,
// articles, ça s'adresse à tous les commerçants ». Une boutique qui vend
// quarante modèles en S, M, L, XL réécrivait ses quatre tailles quarante fois,
// exactement comme la pizzeria réécrivait ses garnitures.
//
// ⚠️ MAIS CE N'EST PAS LE MÊME OBJET, ET ÇA CHANGE LA RÈGLE. Un groupe
// d'options s'AJOUTE à un article : il peut en avoir trois. Les axes de
// variantes, eux, sont UNE matrice par article, et l'écrire remplace celle qui
// s'y trouve. Copier vers un article déjà équipé détruirait donc ses tailles,
// ses prix et ses stocks. On l'écarte, comme on écarte un groupe en conflit.

/** Les axes à recopier sur un autre article. */
export function axesDeLArticle(article) {
  if (!article || typeof article !== 'object') return null
  const sortie = {}
  for (const champ of CHAMPS_VARIANTES) sortie[champ] = article[champ] ?? null
  // ⚠️ ON FORCE LE DRAPEAU : copier une matrice sans l'allumer poserait des
  // tailles que l'écran de l'article cible n'afficherait même pas.
  sortie.gere_variantes = true
  return sortie
}

/**
 * Les articles qui ont DÉJÀ une matrice, et qu'on ne touche donc pas.
 *
 * ⚠️ « Déjà équipé » se lit sur le drapeau ET sur les axes : un article dont
 * `gere_variantes` est resté vrai après que ses valeurs ont été vidées n'a
 * plus rien à perdre, et le priver de la copie serait un refus incompréhensible.
 */
export function conflitsDeVariantes(cibleIds = [], articles = []) {
  const parId = new Map((Array.isArray(articles) ? articles : []).map(a => [String(a?.id), a]))
  return (Array.isArray(cibleIds) ? cibleIds : []).filter(id => {
    const a = parId.get(String(id))
    if (!a) return false
    const axes = Array.isArray(a.axe1_valeurs) ? a.axe1_valeurs : []
    return a.gere_variantes === true && axes.length > 0
  })
}

/**
 * Ce que le commerçant lit avant d'étendre sa matrice.
 *
 * ⚠️ LE MOT « ÉCRASER » N'APPARAÎT PAS PAR HASARD : c'est la seule chose qu'il
 * doit retenir, et la raison pour laquelle certains articles sont écartés.
 */
export function resumeDeVariantes({ cibles = 0, conflits = 0 } = {}) {
  const aCopier = Math.max(0, cibles - conflits)
  if (cibles <= 0) return 'Choisis au moins un article.'
  if (aCopier === 0) {
    return conflits === 1
      ? 'Cet article a déjà ses propres variantes. Rien à copier, elles ne seront pas écrasées.'
      : `Ces ${conflits} articles ont déjà leurs propres variantes. Rien à copier, elles ne seront pas écrasées.`
  }
  const quoi = aCopier === 1 ? '1 article' : `${aCopier} articles`
  const base = `Les mêmes variantes seront créées sur ${quoi}, à stock zéro.`
  if (conflits <= 0) return base
  const ignores = conflits === 1
    ? '1 autre est ignoré, il a déjà les siennes'
    : `${conflits} autres sont ignorés, ils ont déjà les leurs`
  return `${base} ${ignores}, et rien n’y sera écrasé.`
}

// ─── LA BIBLIOTHÈQUE : PARTIR DU GROUPE, PAS DE L'ARTICLE ───────────────────
//
// 🔴 POURQUOI (Alex, 25/09). « Avoir les groupes existants au-dessus, pouvoir
// les sélectionner et les appliquer à d'autres articles. Toujours plus de
// facilité. » Ouvrir une pizza pour trouver un groupe et le copier ailleurs,
// c'est le raisonnement à l'envers : le commerçant pense « mes garnitures »,
// pas « les garnitures de la margherita ».
//
// 🔴 ET LE PIÈGE EST LÀ : DEUX GROUPES DU MÊME NOM PEUVENT DIFFÉRER. « Sauces »
// sur douze pizzas, mais l'une a une sauce en plus ajoutée exprès. Les afficher
// comme un seul groupe est ce que le commerçant veut lire ; appliquer n'importe
// laquelle des douze versions sans le dire serait un mensonge. On prend donc la
// PLUS COMPLÈTE comme modèle, et on annonce que d'autres versions existent.
//
// ⚠️ LA PLUS COMPLÈTE, ET PAS LA PLUS RÉCENTE : ajouter une valeur oubliée ne
// coûte rien au commerçant, en retrouver une qu'on a silencieusement retirée
// lui coûte de la relire sur quarante articles.

/**
 * Les groupes du commerce, un par nom, prêts à être appliqués ailleurs.
 *
 * @param groupes tous les groupes du commerce, avec leurs `valeurs`
 * @returns [{ nom, type, obligatoire, valeurs, articles, modele, versions }]
 *          `versions` vaut 2 ou plus quand des articles portent un contenu
 *          différent sous le même nom.
 */
export function bibliothequeDeGroupes(groupes = []) {
  const liste = Array.isArray(groupes) ? groupes : []
  const parNom = new Map()

  for (const g of liste) {
    const nom = String(g?.nom || '').trim()
    if (!nom) continue
    const cle = nom.toLowerCase()
    if (!parNom.has(cle)) parNom.set(cle, [])
    parNom.get(cle).push(g)
  }

  const sortie = []
  for (const [, mêmes] of parNom) {
    // Le modèle : le plus de valeurs. À égalité, le premier rencontré, pour
    // que deux lectures de suite donnent la même réponse.
    let modele = mêmes[0]
    for (const g of mêmes) {
      if ((g?.valeurs?.length || 0) > (modele?.valeurs?.length || 0)) modele = g
    }
    // ⚠️ LA SIGNATURE COMPARE LE CONTENU, PAS L'ORDRE NI LES IDENTIFIANTS :
    // deux commerçants qui ajoutent les mêmes sauces dans un ordre différent
    // ont bien le même groupe.
    const signature = (g) => (g?.valeurs || [])
      .map(v => `${String(v?.nom || '').trim().toLowerCase()}:${Number(v?.prix_supplement) || 0}`)
      .sort()
      .join('|')
    const versions = new Set(mêmes.map(signature)).size

    sortie.push({
      nom: String(modele?.nom || '').trim(),
      type: modele?.type === 'multiple' ? 'multiple' : 'unique',
      obligatoire: modele?.obligatoire === true,
      valeurs: Array.isArray(modele?.valeurs) ? modele.valeurs : [],
      articles: [...new Set(mêmes.map(g => g?.article_id).filter(x => x != null).map(String))],
      modele,
      versions,
    })
  }

  // ⚠️ LE PLUS UTILISÉ EN PREMIER : c'est celui que le commerçant cherche, et
  // celui qu'il voudra poser sur son nouvel article.
  return sortie.sort((a, b) => (b.articles.length - a.articles.length) || a.nom.localeCompare(b.nom))
}

/**
 * Ce qu'on dit d'un groupe de la bibliothèque, en une ligne.
 *
 * ⚠️ LE NOMBRE D'ARTICLES EST L'INFORMATION UTILE : il dit au commerçant si ce
 * groupe est sa règle générale ou une exception, avant qu'il l'étende encore.
 */
export function phraseDeBibliotheque({ articles = [], valeurs = [], versions = 1 } = {}) {
  const nbA = articles.length
  const nbV = valeurs.length
  const morceaux = [
    nbA === 1 ? 'sur 1 article' : `sur ${nbA} articles`,
    nbV === 1 ? '1 option' : `${nbV} options`,
  ]
  if (versions > 1) {
    // 🔴 ON LE DIT, SINON ON APPLIQUE UNE VERSION QU'IL N'A PAS CHOISIE.
    morceaux.push(`⚠️ ${versions} versions différentes, la plus complète sert de modèle`)
  }
  return morceaux.join(' · ')
}

// ─── CE QU'ON DIT AVANT D'ÉCRIRE ────────────────────────────────────────────
//
// ⚠️ « Copier ? » N'EST PAS UNE QUESTION, C'EST UN BOUTON. Le commerçant doit
// lire combien d'articles il touche et lesquels ont déjà ce groupe, sinon il
// clique sans savoir. Cette phrase est la dernière chose qu'il lit avant que
// trente lignes partent en base.
export function resumeDeCopie({ nomGroupe, cibles = 0, conflits = 0 } = {}) {
  const nom = String(nomGroupe || '').trim() || 'Ce groupe'
  const aCopier = Math.max(0, cibles - conflits)
  if (cibles <= 0) return 'Choisis au moins un article.'
  // ⚠️ LE CAS OÙ IL N'EN RESTE AUCUN DOIT SE LIRE COMME UN REFUS, pas comme un
  // succès à zéro : sinon le commerçant clique, rien ne se passe, et il
  // recommence en pensant avoir mal cliqué.
  if (aCopier === 0) {
    return conflits === 1
      ? `Cet article a déjà un groupe « ${nom} ». Rien à copier.`
      : `Ces ${conflits} articles ont déjà un groupe « ${nom} ». Rien à copier.`
  }
  const quoi = aCopier === 1 ? '1 article' : `${aCopier} articles`
  if (conflits <= 0) return `« ${nom} » sera ajouté à ${quoi}.`
  const ignores = conflits === 1
    ? '1 autre est ignoré, il a déjà un groupe de ce nom'
    : `${conflits} autres sont ignorés, ils ont déjà un groupe de ce nom`
  return `« ${nom} » sera ajouté à ${quoi}. ${ignores}, et rien n’y sera écrasé.`
}

// Le partage des cibles entre ce qu'on écrit et ce qu'on laisse tranquille.
//
// ⚠️ ELLE EXISTE POUR QUE L'ÉCRAN NE REFASSE PAS LE TRI LUI-MÊME. Deux endroits
// qui décident « qui reçoit la copie » finiraient par ne plus répondre la même
// chose, et c'est le résumé lu par le commerçant qui deviendrait faux.
export function repartirCibles(cibleIds = [], conflits = []) {
  const bloques = new Set((Array.isArray(conflits) ? conflits : []).map(String))
  const liste = Array.isArray(cibleIds) ? cibleIds : []
  return {
    aCopier: liste.filter(id => !bloques.has(String(id))),
    ignores: liste.filter(id => bloques.has(String(id))),
  }
}
