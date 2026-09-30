// LA CARTE QU'ON LIT À TABLE (29/09).
//
// 🔴 POURQUOI ÇA EXISTE. Un restaurateur réimprimait ses menus chaque semaine
// pour ses suggestions et son lunch du jour. Il voulait un QR sur ses tables :
// on scanne, on lit la carte, et c'est lui qui la tient à jour depuis son
// tableau de bord, sans rien réimprimer.
//
// ⚠️ LA FICHE NE CONVENAIT PAS, ET C'EST POUR ÇA QU'IL Y A UNE PAGE À PART
// (`app/menu/[slug]/page.js`). La fiche est faite pour COMMANDER : un
// restaurant qui prend aussi des réservations y ouvre sur « Réserver une table
// ou commander à emporter », deux gestes qui n'ont aucun sens pour quelqu'un
// déjà assis. Et elle est lourde : tout le panier, le paiement, la livraison,
// chargés après coup dans le navigateur, sur la 4G du fond de la salle.
//
// ⚠️ FONCTION PURE, et c'est ce qui permet de la mesurer : la page ne fait que
// lire la base et poser ce que cette fonction rend.

import { categoriesOrdonnees } from './categories-catalogue.js'
import { euros } from './montants.js'

// Le tas de ce que le commerçant n'a pas classé. Il reste EN DERNIER, comme
// sur la fiche : ce n'est pas une catégorie qu'il a nommée.
export const TITRE_SANS_CATEGORIE = 'Autres'

/**
 * Le prix tel qu'il s'écrit sur la carte, ou `null` quand il ne s'écrit pas.
 *
 * ⚠️ LE PRIX DE LA SALLE, JAMAIS CELUI D'UN DEAL. Une remise Yoppaa porte sur
 * une commande passée dans l'application. Afficher un prix barré à table
 * promettrait au client un prix que la salle ne pratique pas, et c'est le
 * serveur qui se ferait reprendre au moment de l'addition.
 *
 * ⚠️ UNE ABSENCE N'EST PAS ZÉRO. `Number(null)` vaut 0 : un article sans prix
 * saisi sortirait « 0,00 € », et le client le croirait offert.
 *
 * @param {object} article
 * @param {{ prixAffiches?: boolean }} [o] faux quand la formule masque les prix
 */
export function prixALaCarte(article, { prixAffiches = true } = {}) {
  if (!prixAffiches) return null
  const brut = article?.prix
  const saisi = brut !== null && brut !== undefined && String(brut).trim() !== ''
  const prix = saisi ? Number(brut) : NaN
  // ✅ LE PRIX EST TOUJOURS FERME (Alex, 30/09), vitrine comprise : ni « dès »,
  // ni « Prix sur demande ». À table, un plat « sur place uniquement » est
  // justement celui qu'on sert : il se lit comme les autres. Sans prix, rien.
  if (article?.est_vitrine) return prix > 0 ? euros(prix) : null
  return Number.isFinite(prix) ? euros(prix) : null
}

/**
 * Le plat est-il servi aujourd'hui ?
 *
 * ⚠️ C'EST CE QUI FAIT TENIR LE LUNCH DU JOUR SANS RIEN AJOUTER. Le commerçant
 * règle déjà, article par article, les jours où il le propose
 * (`article_stock_jour`) : un « lunch du lundi » désactivé les autres jours
 * disparaît de la carte ces jours-là, tout seul.
 *
 * ⚠️ SANS RÉGLAGE POUR CE JOUR, LE PLAT EST SERVI. C'est le cas normal : la
 * plupart des articles n'ont aucune ligne par jour.
 *
 * ⚠️ LE STOCK N'Y EST POUR RIEN. Un stock à zéro dit « plus rien à commander en
 * ligne aujourd'hui », pas « ce plat n'existe plus en salle ».
 *
 * @param {object} article
 * @param {Array<{article_id: string, actif: boolean}>} reglagesDuJour les lignes de CE jour
 */
export function servieAujourdhui(article, reglagesDuJour = []) {
  const reglage = (reglagesDuJour || []).find(r => r.article_id === article?.id)
  return !reglage || reglage.actif !== false
}

/**
 * La carte, rangée comme le commerçant l'a voulue.
 *
 * @param {object} o
 * @param {object} o.commercant       `ordre_categories`, `photos_catalogue_actif`
 * @param {object[]} o.articles       les articles actifs
 * @param {object[]} [o.reglagesDuJour] les lignes `article_stock_jour` du jour
 * @param {boolean} [o.prixAffiches]
 * @returns {{ sections: Array<{ancre: string, titre: string, parent: string|null, articles: object[]}>, total: number }}
 */
export function carteDeLaTable({ commercant, articles = [], reglagesDuJour = [], prixAffiches = true }) {
  const servis = (articles || []).filter(a => a && a.actif !== false && servieAujourdhui(a, reglagesDuJour))

  // ⚠️ LE MÊME INTERRUPTEUR QUE LA FICHE. Un commerçant qui a coupé les photos
  // de son catalogue ne les retrouve pas sur ses tables.
  const photos = commercant?.photos_catalogue_actif !== false
  const ligne = (a) => ({
    id: a.id,
    nom: a.nom,
    description: a.description || null,
    prix: prixALaCarte(a, { prixAffiches }),
    photo: photos ? (a.photo_url || null) : null,
  })

  // ⚠️ L'ORDRE VOULU PAR LE COMMERÇANT, par la MÊME fonction que la fiche : un
  // restaurateur qui a mis ses suggestions en tête les retrouve en tête ici.
  const categories = categoriesOrdonnees(
    [...new Set(servis.map(a => a.categorie).filter(Boolean))],
    commercant?.ordre_categories,
  )

  const sections = []
  let parentPrecedent = null
  categories.forEach(cat => {
    const arts = servis.filter(a => a.categorie === cat)
    if (!arts.length) return
    // Sous-catégorie « Parent · Enfant » : le parent ne s'écrit qu'une fois
    // par groupe, comme sur la fiche.
    const i = cat.indexOf(' · ')
    const parent = i > -1 ? cat.slice(0, i) : null
    const titre = i > -1 ? cat.slice(i + 3) : cat
    sections.push({
      ancre: `c${sections.length + 1}`,
      titre,
      parent: parent && parent !== parentPrecedent ? parent : null,
      articles: arts.map(ligne),
    })
    parentPrecedent = parent || cat
  })

  const sansCategorie = servis.filter(a => !a.categorie)
  if (sansCategorie.length) {
    sections.push({ ancre: `c${sections.length + 1}`, titre: TITRE_SANS_CATEGORIE, parent: null, articles: sansCategorie.map(ligne) })
  }

  return { sections, total: servis.length }
}
