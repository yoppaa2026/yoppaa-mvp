// Calcul SERVEUR des lignes d'une commande de produits, et vérification du
// stock disponible. Partagé par les deux routes qui vendent des produits :
//
//   • /api/stripe/checkout/create-commande        (boutique, C&C, livraison)
//   • /api/stripe/checkout/create-rdv-commande    (produits pris avec un RDV)
//
// POURQUOI CE MODULE EXISTE. Le prix qui fait foi est celui calculé ici : le
// navigateur n'annonce que des identifiants et des quantités. Le jour où un
// second tunnel a eu besoin de vendre les mêmes produits, recopier ce calcul
// aurait garanti que les deux versions divergent, et qu'un client paie un prix
// dans un parcours et un autre prix dans l'autre. Un seul calcul, deux
// appelants.
//
// Ces fonctions ne connaissent ni Stripe ni NextResponse : elles renvoient un
// objet d'erreur que l'appelant traduit en réponse HTTP.

import { tauxPourArticle } from '@/lib/tva'
import { estOffreSeparee, dealActifCeJour, prixEffectif, prixEffectifVariante } from '@/lib/deals'
// ⚠️ LA RÈGLE DU PLAFOND VIT DANS LE MODULE DE L'OFFRE, pas ici : l'écran et le
// serveur doivent dire le même chiffre au Yopper.
import { plafondDeLOffre, refusDeQuantite, porteUneFenetre } from '@/lib/anti-gaspi'
import { comptoirDuJour, circuitDuJour, maximumSurCommande } from '@/lib/stock-article'
import { jourCivil, jourBelgeDeCreation } from '@/lib/heure-belge'

// Colonnes indispensables au calcul. Exportées pour que les deux routes lisent
// exactement les mêmes champs : un select incomplet ici se traduit par un prix
// faux, pas par une erreur.
// 🔴 `vente_jour`, `commande_active` (temps 3, 08/10) : la règle du jour les lit
// sur ces lignes. Absentes, `commande_active` vaudrait faux et le serveur
// refuserait TOUTE commande pour un autre jour. Trouvé à la relecture, pas
// par un banc : une garde exécute maintenant la règle sur ce select.
export const SELECT_ARTICLES = 'id, nom, prix, categorie, actif, commercant_id, temps_prepa, est_vitrine, tva_taux, tva_taux_sur_place, delai_minutes, vente_jour, commande_active'
// 🔴 CE QUI NE CONSOMME NI STOCK NI OFFRE, ET LA LISTE ÉTAIT ÉCRITE DEUX FOIS.
//
// Une commande non retirée rend sa marchandise ; une commande annulée n'a
// jamais existé. Une commande en attente de paiement, elle, tient sa place le
// temps du passage sur Stripe, sinon deux Yoppers prendraient la même dernière
// assiette.
//
// ⚠️ ELLE VIVAIT EN DEUX EXEMPLAIRES, dans le contrôle du stock et dans celui
// de l'offre, avec un commentaire promettant qu'ils disaient la même chose.
// Une affirmation en commentaire se vérifie comme du code : elle vit maintenant
// à UN endroit, et les deux la lisent.
//
// ⚠️ ET C'EST UNE MUTATION QUI L'A RÉVÉLÉ. Elle visait la liste de l'offre,
// `String.replace` a pris la PREMIÈRE occurrence — celle du stock — et le banc
// est resté vert à juste titre. La duplication était le vrai défaut.
// ⚠️ `annulee_commercant` (I5, 05/10) : même liste que les fonctions SQL de
// stock, qui l'ont apprise dans la même migration.
export const STATUTS_QUI_NE_CONSOMMENT_PAS = '("non_retire","annulee_paiement_ko","annulee_client_refund","annulee_commercant")'

// 🔴 UNE COLONNE ABSENTE D'UN SELECT EST LE DÉFAUT LE PLUS FRÉQUENT DE CE
// PROJET, sept fois vu. Ici il ne lèverait AUCUNE erreur : la remise serait
// simplement introuvable, le serveur facturerait le prix plein, et l'écran
// aurait affiché « -10 % ». Chaque cible ajoutée doit passer par cette ligne.
export const SELECT_DEALS = 'id, titre, prix_deal, actif, commercant_id, deal_type, remise_pct, unites_par_deal, article2_id, article_id, categorie_cible, prestation_id, cible_tout, date_deal, date_debut, date_fin, heure_debut, heure_fin, quantite'

function echec(error, status = 400, extra = {}) {
  return { ok: false, error, status, ...extra }
}

// Construit les lignes de commande à partir du panier envoyé par le navigateur.
//
// `panier` : [{ id, quantite, options?, variante_id?, deal_id? }]
// Renvoie { ok: true, lignes, totalCents } ou { ok: false, error, status }.
export function construireLignesCommande({
  panier,
  articlesData,
  optionsValeurs,
  variantesData,
  dealsData,
  commercant,
  regime,
  dateCommande,
}) {
  const articleParId = Object.fromEntries((articlesData || []).map(a => [a.id, a]))
  const valeurParId = Object.fromEntries((optionsValeurs || []).map(v => [v.id, v]))
  const varianteParId = Object.fromEntries((variantesData || []).map(v => [v.id, v]))
  const dealParId = Object.fromEntries((dealsData || []).map(d => [d.id, d]))

  // Deals dont la fenêtre couvre la date de la commande. Les remises sont
  // appliquées à partir de cette liste, ligne par ligne, sans rien attendre du
  // navigateur : une promo qui n'existe que dans l'affichage n'est pas une
  // promo, et une promo expirée ne doit pas survivre dans un panier resté
  // ouvert depuis la veille.
  const dealsDuJour = (dealsData || []).filter(d => dealActifCeJour(d, dateCommande))

  const lignes = []
  let totalCents = 0

  for (const item of panier) {
    const article = articleParId[item.id]
    if (!article) return echec('Un ou plusieurs articles introuvables.')
    const quantite = parseInt(item.quantite, 10)
    if (!quantite || quantite < 1 || quantite > 50) {
      return echec(`Quantité invalide pour "${article.nom}".`)
    }

    // Suppléments d'options, recalculés serveur pour empêcher le tampering.
    const optionsFlat = []
    let supplement = 0
    if (Array.isArray(item.options)) {
      for (const opt of item.options) {
        const ids = Array.isArray(opt.valeur_ids) ? opt.valeur_ids : []
        for (const vid of ids) {
          const v = valeurParId[vid]
          if (!v) continue
          const grp = v.article_options_groupes
          if (!grp || grp.article_id !== article.id) continue
          optionsFlat.push({
            groupe_nom: grp.nom || '',
            valeur_nom: v.nom,
            prix_supplement: Number(v.prix_supplement || 0),
          })
          supplement += Number(v.prix_supplement || 0)
        }
      }
    }

    // Variante (taille, couleur) : le prix et le stock de LA version font foi,
    // le libellé est rangé dans options (jsonb) pour s'afficher partout.
    let variante = null
    if (item.variante_id) {
      variante = varianteParId[item.variante_id]
      if (!variante || variante.article_id !== article.id || variante.actif === false) {
        return echec(`Version introuvable pour "${article.nom}".`)
      }
      if ((variante.stock ?? 0) < quantite) {
        return echec(`Stock insuffisant pour "${article.nom}" (${[variante.axe1_valeur, variante.axe2_valeur].filter(Boolean).join(' · ')}).`)
      }
      optionsFlat.unshift({
        groupe_nom: 'Version',
        valeur_nom: [variante.axe1_valeur, variante.axe2_valeur].filter(Boolean).join(' · '),
        prix_supplement: 0,
      })
    }

    // ─── Deals : deux régimes qui ne se mélangent jamais ───────────────────
    //
    // Un LOT ou un DUO est une offre séparée : le navigateur l'envoie avec son
    // deal_id, elle a son prix et son libellé propres, et l'unité reste
    // commandable à côté. Une REMISE, elle, modifie le prix de l'article :
    // elle est recalculée ici pour CHAQUE ligne, qu'elle soit annoncée ou non
    // par le navigateur.
    //
    // Un deal_id de type remise, envoyé par un onglet resté ouvert sur
    // l'ancien modèle, n'est donc plus traité comme une offre : la ligne
    // redevient un article normal, remisé une seule fois. Sans cette
    // précaution la remise s'appliquerait deux fois, ou pas du tout.
    let deal = null
    if (item.deal_id) {
      const candidat = dealParId[item.deal_id]
      if (!candidat) return echec('Ce deal n\'est plus disponible.')
      if (estOffreSeparee(candidat)) {
        // Fenêtre de dates vérifiée serveur (audit deals n°3) : l'offre doit
        // couvrir la date de la commande.
        if (!dealActifCeJour(candidat, dateCommande)) {
          return echec(`Le deal « ${candidat.titre} » n'est plus valable pour cette date.`)
        }
        if (candidat.prix_deal == null) return echec('Ce deal n\'est plus disponible.')
        deal = candidat
      }
    }

    // Prix retenu : celui de l'offre séparée, sinon le prix de l'article ou de
    // sa version, remise du jour comprise.
    const prixBase = deal
      ? Number(deal.prix_deal)
      : variante && variante.prix != null
        ? prixEffectifVariante(variante.prix, article, dealsDuJour, dateCommande)
        : prixEffectif(article, dealsDuJour, dateCommande)
    const prixUnitaire = prixBase + supplement
    totalCents += Math.round(prixUnitaire * 100) * quantite

    lignes.push({
      article_id: article.id,
      article_nom: deal ? deal.titre : article.nom,
      // ⚠️ L'IDENTIFIANT DE LA VERSION, pas seulement son libellé. Le libellé
      // part dans `options` pour s'afficher partout, mais il ne peut pas servir
      // à rendre le stock : deux versions peuvent porter le même nom après un
      // renommage. Sans cet identifiant, une commande abandonnée emportait sa
      // pièce définitivement hors des rayons.
      variante_id: variante ? variante.id : null,
      quantite,
      // TVA FIGÉE À LA VENTE. Le taux est recopié ici et ne sera plus jamais
      // recalculé : sans cela, changer le taux d'un article réécrirait
      // rétroactivement toutes les commandes passées, et les exports comme les
      // déclarations deviendraient incohérents. Un deal suit le taux de son
      // article sous-jacent, c'est la même marchandise.
      tva_taux: tauxPourArticle({
        article,
        regime,
        tauxDefautCommerce: commercant.tva_taux_defaut,
      }),
      // Consommation stock RÉELLE : un lot « 3+1 » consomme unites_par_deal
      // unités physiques par lot commandé (audit deals n°1).
      quantite_stock: quantite * (deal?.unites_par_deal || 1),
      // Duo : le second article du deal consomme aussi son stock (1 par duo).
      deal_article2_id: (deal?.deal_type === 'bundle' && deal.article2_id) ? deal.article2_id : null,
      prix_unitaire: prixUnitaire,
      options: optionsFlat.length > 0 ? optionsFlat : null,
      temps_prepa: article.temps_prepa || 1,
      // ⚠️ LE DÉLAI VIENT DE L'ARTICLE RÉSOLU EN BASE, jamais du navigateur.
      // C'est ce qui rend le serveur immunisé contre le défaut de la fiche, où
      // la ligne d'un lot se construisait à la main et perdait le délai de sa
      // tarte : ici, un lot et une unité passent par le MÊME `article`.
      delai_minutes: article.delai_minutes ?? 0,
      // 🔴 L'IDENTIFIANT DE L'OFFRE, ET IL ÉTAIT JETÉ. Il servait à calculer le
      // prix, puis il disparaissait : impossible ensuite de savoir combien
      // d'unités d'une offre avaient été vendues, donc impossible de la
      // plafonner. Alex l'a vu le 04/09 : trois assiettes publiées, quinze
      // proposées à moitié prix.
      deal_id: deal ? deal.id : null,
      // ⚠️ LA FENÊTRE DE L'OFFRE DE FIN DE JOURNÉE, telle qu'elle est en base.
      // C'est elle, et rien d'autre, qui fait un invendu : pas de drapeau à
      // côté qui pourrait dire le contraire des heures. Sur un deal ordinaire
      // les deux valeurs sont nulles, et le module conclut « ce n'en est pas ».
      offre: deal ? { heure_debut: deal.heure_debut, heure_fin: deal.heure_fin } : null,
    })
  }

  return { ok: true, lignes, totalCents }
}

const JOURS_DIMANCHE_PREMIER = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// Vérifie que le stock du jour couvre la commande.
//
// Stock disponible = stock du jour
//                  - quantités déjà commandées ce jour-là (hors annulées)
//                  - réservations en cours non expirées
//
// 🔴 « STOCK DU JOUR (DÉFAUT) » N'ÉTAIT PLAFONNÉ QUE PAR LE NAVIGATEUR (31/08).
//
// Cette fonction ne connaissait QUE la grille `article_stock_jour`, et traitait
// l'absence d'entrée comme « aucun stock géré ». Or le tableau de bord propose
// aussi un stock global, `articles.stock_jour`, et le navigateur l'applique
// depuis toujours en repli. Un commerçant qui réglait « 10 » sur ce champ
// annonçait donc dix pains et pouvait en vendre quarante.
//
// ⚠️ C'EST LE MÉTA-DÉFAUT DU PROJET, pour la quatrième fois : l'écran calcule,
// le serveur décide. Ici l'écran calculait et le serveur ne décidait rien.
//
// ⚠️ ET LA RÈGLE EST RECOPIÉE DE `getStockMax`, DÉLIBÉRÉMENT MOT POUR MOT :
//   1) une entrée du jour de semaine fait foi, y compris quand elle vaut zéro ;
//   2) sinon le stock global fait foi, s'il est strictement positif ;
//   3) sinon, et seulement là, il n'y a aucune limite.
// Les deux copies ne peuvent pas être fusionnées : l'une garde une transaction
// SQL, l'autre un écran. Un banc vérifie donc qu'elles disent la même chose.
//
// 🔴 LES DEUX CIRCUITS DE L'ALIMENTAIRE (temps 3, 08/10), MÊME RÈGLE QUE LA
// RÉSERVATION SQL : aujourd'hui = A (quantité du jour, comptoir ; seules les
// commandes PASSÉES aujourd'hui l'entament), un autre jour = B (maximum par
// jour ; toutes les commandes de ce jour comptent). `commercant` dit si le
// commerce a deux circuits ; `maintenant` sert aux bancs.
export async function verifierStockDisponible({ supabase, lignes, commercantId, dateCommande, commercant, maintenant = new Date() }) {
  // Les seconds articles des duos consomment aussi leur stock.
  const stockArticleIds = [...new Set([
    ...lignes.map(l => l.article_id),
    ...lignes.map(l => l.deal_article2_id).filter(Boolean),
  ])]
  if (stockArticleIds.length === 0) return { ok: true }

  const [
    { data: stocksJour, error: errGrille },
    { data: articlesStock, error: errArticles },
    { data: commandesDejaJour, error: errCommandes },
    { data: reservationsActives, error: errReservations },
  ] = await Promise.all([
    supabase.from('article_stock_jour')
      .select('article_id, jour_semaine, stock, actif')
      .in('article_id', stockArticleIds),
    // ⚠️ LE STOCK GLOBAL, celui du champ « Stock du jour (défaut) ». Sans cette
    // requête, le repli n'a rien à lire et la garde reste aveugle.
    // 🔴 ET LE COMPTOIR DU JOUR (07/10), même règle que la réservation SQL.
    // 🔴 ET LES DEUX CIRCUITS (08/10) : sans eux, tout autre jour serait refusé.
    supabase.from('articles')
      .select('id, stock_jour, stock_comptoir, stock_comptoir_le, vente_jour, commande_active, commande_max_jour')
      .in('id', stockArticleIds),
    // ⚠️ `created_at` : en A, seules les commandes passées le jour même comptent.
    supabase.from('commande_articles')
      .select('article_id, quantite, commande:commandes!inner(date_commande, statut, commercant_id, created_at)')
      .in('article_id', stockArticleIds)
      .eq('commande.date_commande', dateCommande)
      .eq('commande.commercant_id', commercantId)
      .not('commande.statut', 'in', STATUTS_QUI_NE_CONSOMMENT_PAS),
    supabase.from('commande_stock_reservation')
      .select('article_id, quantite')
      .in('article_id', stockArticleIds)
      .eq('date_commande', dateCommande)
      .gt('expires_at', maintenant.toISOString()),
  ])
  // 🔴 UNE LECTURE EN ÉCHEC NE VAUT NI « ZÉRO VENDU » NI « PAS SUR COMMANDE » :
  // la première ouvrirait le stock en grand, la seconde refuserait tout autre
  // jour avec un faux motif. On refuse, et on le dit.
  if (errGrille || errArticles || errCommandes || errReservations) {
    return echec('Impossible de vérifier le stock. Réessaie dans un instant.', 503)
  }

  const jourSemaine = JOURS_DIMANCHE_PREMIER[new Date(dateCommande + 'T12:00:00').getDay()]
  const circuit = circuitDuJour({ commercant, jour: dateCommande, aujourdhui: jourCivil(maintenant) })

  const qteDejaParArticle = {}
  ;(commandesDejaJour || []).forEach(r => {
    // ⚠️ EN A, UNE COMMANDE PASSÉE UN JOUR D'AVANT EST DU CIRCUIT B, préparée à
    // part : elle n'entame pas la quantité du jour.
    if (circuit === 'A' && jourBelgeDeCreation(r.commande?.created_at) !== dateCommande) return
    qteDejaParArticle[r.article_id] = (qteDejaParArticle[r.article_id] || 0) + r.quantite
  })
  const qteReserveeParArticle = {}
  ;(reservationsActives || []).forEach(r => {
    qteReserveeParArticle[r.article_id] = (qteReserveeParArticle[r.article_id] || 0) + r.quantite
  })

  // Consommation AGRÉGÉE par article : une même commande peut cumuler l'unité,
  // un ou plusieurs deals du même article, et le second article d'un duo.
  const consoParArticle = {}
  const nomParArticle = {}
  // ⚠️ UN ARTICLE N'EST « INVENDU » QUE SI TOUTE SA CONSOMMATION VIENT D'UNE
  // OFFRE DE FIN DE JOURNÉE : une tarte à l'unité dans le même panier reste
  // soumise à son circuit. Même drapeau que celui envoyé à la réservation.
  const invenduParArticle = {}
  for (const ligne of lignes) {
    const inv = porteUneFenetre(ligne.offre)
    consoParArticle[ligne.article_id] = (consoParArticle[ligne.article_id] || 0) + (ligne.quantite_stock || ligne.quantite)
    invenduParArticle[ligne.article_id] = (invenduParArticle[ligne.article_id] ?? true) && inv
    if (!nomParArticle[ligne.article_id]) nomParArticle[ligne.article_id] = ligne.article_nom
    if (ligne.deal_article2_id) {
      consoParArticle[ligne.deal_article2_id] = (consoParArticle[ligne.deal_article2_id] || 0) + ligne.quantite
      invenduParArticle[ligne.deal_article2_id] = (invenduParArticle[ligne.deal_article2_id] ?? true) && inv
      if (!nomParArticle[ligne.deal_article2_id]) nomParArticle[ligne.deal_article2_id] = ligne.article_nom
    }
  }

  const stockGlobalParArticle = {}
  const comptoirParArticle = {}
  const articleParId = {}
  ;(articlesStock || []).forEach(a => {
    stockGlobalParArticle[a.id] = Number(a.stock_jour || 0)
    comptoirParArticle[a.id] = comptoirDuJour(a, dateCommande)
    articleParId[a.id] = a
  })

  for (const [artId, conso] of Object.entries(consoParArticle)) {
    const stockEntry = (stocksJour || []).find(s => s.article_id === artId && s.jour_semaine === jourSemaine)
    if (stockEntry?.actif === false) {
      return echec(`Article "${nomParArticle[artId]}" non disponible ce jour-là.`)
    }
    const art = articleParId[artId]
    const nom = nomParArticle[artId] || 'Un article'

    // ═══ B : SUR COMMANDE, POUR UN AUTRE JOUR ═══
    if (circuit === 'B') {
      if (art?.commande_active !== true) {
        return echec(messageCircuit('ARTICLE_PAS_SUR_COMMANDE', nom), 409)
      }
      const max = maximumSurCommande(art)
      if (max === null) continue
      const dispoB = max - (qteDejaParArticle[artId] || 0) - (qteReserveeParArticle[artId] || 0)
      if (conso > dispoB) {
        return echec(
          `Plus assez de « ${nom} » sur commande pour ce jour-là : ${Math.max(0, dispoB)} disponible(s). Choisis un autre jour.`,
          409,
          { article_id: artId, stock_disponible: Math.max(0, dispoB) },
        )
      }
      continue
    }

    // ═══ A : VENDU AUJOURD'HUI (ou boutique : comme avant) ═══
    if (circuit === 'A' && art?.vente_jour === false) {
      // L'invendu est déjà fait : son offre le plafonne (`verifierQuantiteOffres`).
      if (invenduParArticle[artId]) continue
      return echec(messageCircuit('ARTICLE_PAS_AUJOURDHUI', nom), 409)
    }

    // ⚠️ `null` VEUT DIRE « AUCUNE LIMITE », ET ZÉRO VEUT DIRE « PLUS RIEN ».
    // Les confondre laisserait passer un article explicitement mis à zéro pour
    // la journée. Neuvième fois que ce piège se présente sur ce projet.
    // 🔴 LE COMPTOIR SAISI POUR CE JOUR PASSE DEVANT (07/10), après le jour
    // indisponible ci-dessus : c'est l'ordre de `reserver_stock_atomique`.
    const comptoir = comptoirParArticle[artId] ?? null
    const stockBrut = comptoir !== null
      ? comptoir
      : stockEntry
        ? (stockEntry.stock || 0)
        : (stockGlobalParArticle[artId] > 0 ? stockGlobalParArticle[artId] : null)
    if (stockBrut === null) continue

    const dispo = stockBrut - (qteDejaParArticle[artId] || 0) - (qteReserveeParArticle[artId] || 0)
    if (conso > dispo) {
      return echec(
        `Stock insuffisant pour "${nomParArticle[artId]}" : ${Math.max(0, dispo)} disponible(s) (quelqu'un vient de commander).`,
        409,
        { article_id: artId, stock_disponible: Math.max(0, dispo) },
      )
    }
  }

  // consoParArticle et jourSemaine repartent avec le résultat : la réservation
  // atomique du stock (RPC reserver_stock_atomique) en a besoin, et les
  // recalculer chez l'appelant rouvrirait la porte à deux comptages différents
  // du même panier.
  return { ok: true, nomParArticle, consoParArticle, jourSemaine, invenduParArticle }
}

/**
 * Ce que la réservation SQL reçoit : une ligne par article, avec le drapeau de
 * l'invendu. ⚠️ UN SEUL ENDROIT pour les deux routes : sans le drapeau, la
 * réservation refuserait l'invendu d'un article « sur commande seulement ».
 */
export function itemsDeReservation(verif) {
  const inv = verif?.invenduParArticle || {}
  return Object.entries(verif?.consoParArticle || {}).map(([article_id, quantite]) => (
    inv[article_id] ? { article_id, quantite, invendu: true } : { article_id, quantite }
  ))
}

/** Ce que le Yopper lit quand un article n'est pas dans le bon circuit. */
export function messageCircuit(code, nom) {
  if (code === 'ARTICLE_PAS_SUR_COMMANDE') {
    return `« ${nom} » se vend le jour même seulement : il ne se commande pas pour un autre jour.`
  }
  return `« ${nom} » se prend sur commande, pas pour aujourd'hui. Choisis un autre jour.`
}

/**
 * Le refus de `reserver_stock_atomique`, traduit pour le Yopper. `null` si
 * l'erreur n'est pas un refus connu (l'appelant rend alors une erreur 500).
 * ⚠️ LES DEUX ROUTES le lisent ici : chacune avait sa copie des deux
 * premiers motifs, et la troisième copie aurait oublié les deux nouveaux.
 */
export function refusDeReservation(message, nomParArticle = {}) {
  const msg = String(message || '')
  const mStock = msg.match(/STOCK_INSUFFISANT:([0-9a-fA-F-]+):(\d+)/)
  if (mStock) {
    const nom = nomParArticle[mStock[1]] || 'un article'
    return { status: 409, body: { ok: false, error: `Stock insuffisant pour "${nom}" : ${mStock[2]} disponible(s) (quelqu'un vient de commander).`, article_id: mStock[1], stock_disponible: Number(mStock[2]) } }
  }
  const mInactif = msg.match(/ARTICLE_INACTIF:([0-9a-fA-F-]+)/)
  if (mInactif) {
    const nom = nomParArticle[mInactif[1]] || 'un article'
    return { status: 400, body: { ok: false, error: `Article "${nom}" non disponible ce jour-là.` } }
  }
  const mCircuit = msg.match(/(ARTICLE_PAS_SUR_COMMANDE|ARTICLE_PAS_AUJOURDHUI):([0-9a-fA-F-]+)/)
  if (mCircuit) {
    return { status: 409, body: { ok: false, error: messageCircuit(mCircuit[1], nomParArticle[mCircuit[2]] || 'Un article') } }
  }
  return null
}

// ─── LE PLAFOND D'UNE OFFRE DE FIN DE JOURNÉE ───────────────────────────────
//
// 🔴 LE DÉFAUT VU PAR ALEX LE 04/09. Il publie TROIS assiettes à moitié prix, et
// la fiche en propose QUINZE : elle lisait le stock du jour de l'article, pas la
// quantité de l'offre. Soixante et onze euros de manque à gagner sur une offre
// censée écouler trois restes, sans qu'aucune erreur ne s'affiche nulle part.
//
// ⚠️ C'EST LE MÉTA-DÉFAUT DU PROJET, ENCORE : l'écran calcule, le serveur
// décide. Ici l'écran ne calculait même pas la bonne chose, et le serveur ne
// décidait rien du tout.
//
// ⚠️ MÊMES STATUTS QUE LE STOCK, MOT POUR MOT. Une commande non retirée rend sa
// marchandise, donc elle ne consomme pas l'offre ; une commande en attente de
// paiement, si, le temps du passage sur Stripe. Deux règles différentes pour
// « qu'est-ce qui est vendu » auraient divergé au premier changement.
export async function verifierQuantiteOffres({ supabase, lignes, dealsData, commercantId }) {
  const dealParId = Object.fromEntries((dealsData || []).map(d => [d.id, d]))
  // Seules les offres qui portent un plafond nous intéressent : un lot ou un duo
  // ordinaire s'arrête au stock de son article, et `verifierStockDisponible`
  // s'en charge déjà.
  const demandeParDeal = {}
  for (const l of lignes) {
    if (!l.deal_id) continue
    if (plafondDeLOffre(dealParId[l.deal_id]) === null) continue
    demandeParDeal[l.deal_id] = (demandeParDeal[l.deal_id] || 0) + l.quantite
  }
  const ids = Object.keys(demandeParDeal)
  if (ids.length === 0) return { ok: true }

  const { data: vendues, error } = await supabase
    .from('commande_articles')
    .select('deal_id, quantite, commande:commandes!inner(statut, commercant_id)')
    .in('deal_id', ids)
    .eq('commande.commercant_id', commercantId)
    .not('commande.statut', 'in', STATUTS_QUI_NE_CONSOMMENT_PAS)
  // 🔴 UN RELEVÉ QUI ÉCHOUE NE VAUT PAS ZÉRO VENTE. Le traiter comme « rien de
  // vendu » ouvrirait le plafond en grand exactement le jour où la base tousse.
  // On refuse, et on le dit.
  if (error) {
    return { ok: false, status: 503, error: 'Impossible de vérifier ce qu\'il reste sur cette offre. Réessaie dans un instant.' }
  }

  const dejaParDeal = {}
  ;(vendues || []).forEach(r => { dejaParDeal[r.deal_id] = (dejaParDeal[r.deal_id] || 0) + (r.quantite || 0) })

  for (const id of ids) {
    const deal = dealParId[id]
    const refus = refusDeQuantite({
      titre: deal?.titre,
      offre: deal,
      dejaVendu: dejaParDeal[id] || 0,
      demande: demandeParDeal[id],
    })
    if (refus) return { ok: false, status: 409, error: refus, stock_insuffisant: true }
  }
  return { ok: true }
}
