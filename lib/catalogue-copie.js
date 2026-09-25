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
  sortie.nom = nomDeLaCopie(article.nom, nomsExistants)
  sortie.actif = false
  if (commercantId) sortie.commercant_id = commercantId
  return sortie
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
