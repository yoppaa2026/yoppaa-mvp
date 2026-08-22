// Journal des transactions Yoppaa : agrégation et fabrication du CSV.
// Le cœur fiscal (régime, choix du taux, ventilation) vit dans lib/tva.js.
//
// ⚠️ CE N'EST PAS UN JOURNAL DE CAISSE CERTIFIÉ. Yoppaa n'est pas un système
// de caisse enregistrée au sens de la réglementation belge (pas de module de
// contrôle). Ce document sert au comptable et au rapprochement bancaire ; il
// ne dispense pas un établissement soumis au SCE de sa caisse certifiée.
// Cette mention est reprise en tête du fichier exporté, sciemment.

import {
  arrondi, ventiler, cleTaux, libelleTaux,
  regimeDepuisModeRetrait, tauxPourArticle, tauxFraisLivraison, TAUX_NON_RENSEIGNE,
} from './tva'
import { MODES_QUI_ENCAISSENT, MODES_ENCAISSEMENT } from './rdv-paiement'
import { jourBruxelles, heureBruxelles } from './timezone'
import { referenceCommande, referenceRdv, referenceAbonnement, referenceQualifiee } from './numero-commande'

// ─── LE CLIENT ET L'HEURE D'UNE ÉCRITURE ────────────────────────────────────
//
// ⚠️ DEMANDE D'ALEX LE 19/08 : « il faut faire l'export le plus complet
// possible ». Sans nom, un encaissement de 400 € au comptoir ne se rapproche de
// rien ; sans heure, il est introuvable dans le relevé du terminal, où tout est
// horodaté à la minute.
//
// ⚠️ CE FICHIER LISAIT VOLONTAIREMENT ZÉRO COORDONNÉE CLIENT, et son commentaire
// le disait. Ce choix est levé pour le NOM seul : ni email, ni téléphone, ni
// adresse. Le nom sert à rapprocher une ligne d'un paiement ; le reste ne sert
// à rien en comptabilité et n'a donc rien à faire dans un fichier qui sort de
// l'application.
//
// Les tables ne nomment pas leur client de la même façon : `commandes` porte un
// `client_nom` complet, `rdv_reservations` et `abonnements` séparent prénom et
// nom. On rend une seule chaîne, vide plutôt que « undefined ».
function nomClientLigne(...morceaux) {
  return morceaux.map(m => String(m ?? '').trim()).filter(Boolean).join(' ')
}

// L'heure de l'ÉCRITURE, c'est-à-dire le moment où l'argent a été constaté, et
// jamais l'heure du rendez-vous ou du créneau de retrait : c'est celle-là qu'on
// retrouve sur un relevé bancaire.
function heureComptable(...candidats) {
  for (const brut of candidats) {
    const valeur = String(brut ?? '').trim()
    if (!valeur) continue
    // Une colonne DATE nue ne porte aucune heure : on ne l'invente pas.
    if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) continue
    // ⚠️ ET UN JOUR RANGÉ DANS UNE COLONNE D'HORODATAGE NON PLUS.
    //
    // Alex, 19/08 : ses quatre abonnements vendus en ligne affichaient tous
    // exactement « 02:00 ». Ce n'était pas une heure d'achat. Le webhook
    // n'écrivait qu'un JOUR dans `paye_le`, que PostgreSQL range à minuit en
    // temps universel, et minuit UTC vaut 02:00 chez nous en été. J'inventais
    // une heure dans un document comptable, ce que ce fichier dit lui-même
    // qu'il ne faut jamais faire.
    //
    // ⚠️ ON NE PEUT PAS DISTINGUER un achat tombé pile à minuit universel d'un
    // jour rangé là par défaut. On choisit donc de NE RIEN DIRE : une case vide
    // s'interprète, une fausse heure se croit. Le webhook écrit désormais
    // l'instant réel, donc ce repli ne concerne que les ventes d'avant le
    // 19/08.
    if (/T00:00:00(\.0+)?(Z|\+00:?00)$/.test(valeur)) continue
    const heure = heureBruxelles(valeur)
    if (heure) return heure
  }
  return ''
}

// ─── LE JOUR COMPTABLE D'UNE ÉCRITURE ───────────────────────────────────────
//
// ⚠️ DÉFAUT TROUVÉ PAR ALEX LE 19/08 À 00h28 : un abonnement encaissé cette
// nuit-là est arrivé daté du 18. `paye_le` est un INSTANT, et le découper en
// temps universel rend le jour de Greenwich : minuit à Bruxelles, c'est 22h ou
// 23h la VEILLE en UTC selon la saison. Toutes les ventes de la première ou des
// deux premières heures de la nuit tombaient donc dans le mois précédent en fin
// de mois, et dans l'exercice précédent au 1er janvier.
//
// ⚠️ ET ILS ÉTAIENT TROIS, pas un. `paye_le` pour un abonnement, `encaisse_le`
// pour un rendez-vous réglé au comptoir, et `created_at` en secours quand une
// commande n'a pas de date de retrait. Les colonnes DATE (`date_commande`,
// `date_rdv`) ne portent aucun fuseau et sont déjà le bon jour : on ne les
// touche pas.
//
// ⚠️ ON CORRIGE À LA LECTURE, PAS À L'ÉCRITURE. Un instant stocké en UTC est
// juste ; c'est son interprétation qui était fausse. Corriger ici répare aussi
// toutes les lignes DÉJÀ enregistrées, sans migration.
function jourComptable(...candidats) {
  for (const brut of candidats) {
    const valeur = String(brut ?? '').trim()
    if (!valeur) continue
    // Déjà un jour civil : rien à convertir, et surtout rien à décaler.
    //
    // ⚠️ CETTE LIGNE EST MUETTE AU BANC, ET C'EST ASSUMÉ. Bruxelles étant à
    // l'EST de Greenwich, une date nue lue comme minuit UTC retombe sur le même
    // jour ici : la retirer ne casse rien de mesurable. Elle reste parce
    // qu'elle dit une vérité de type, pas parce qu'un test la prouve — une
    // colonne DATE n'est pas un instant et n'a rien à faire dans un fuseau.
    // Elle deviendrait indispensable à l'ouest de Greenwich.
    if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur
    const jour = jourBruxelles(valeur)
    if (jour) return jour
  }
  return ''
}

export { arrondi, ventiler }

// Les statuts qui ne représentent AUCUN chiffre d'affaires : rien n'a été
// vendu, ou la vente a été défaite.
const STATUTS_EXCLUS = ['paiement_en_attente', 'annulee_client_refund', 'annulee_paiement_ko', 'annulee']

export function estComptabilisable(statut) {
  return !STATUTS_EXCLUS.includes(String(statut || ''))
}

// Construit les lignes normalisées à partir des commandes et des rendez-vous.
// Chaque ligne porte déjà sa ventilation : le journal comme le détail s'en
// déduisent, sans recalculer deux fois selon deux logiques.
//
// `articlesParId` sert de filet pour les commandes antérieures au figement des
// taux : on retombe alors sur le taux actuel de l'article, et l'en-tête du
// fichier le signale honnêtement.
export function construireLignes({ commandes = [], rdvs = [], abonnements = [], tauxDefaut = null, articlesParId = {} }) {
  const lignes = []

  for (const c of commandes) {
    if (!estComptabilisable(c.statut)) continue

    const regime = c.regime_tva || regimeDepuisModeRetrait(c.mode_retrait)

    // Ventilation par taux : une même commande peut mélanger du 6 % et du 21 %.
    const parTaux = {}
    let ttcArticles = 0
    for (const la of (c.commande_articles || [])) {
      const ttc = arrondi((Number(la.prix_unitaire) || 0) * (Number(la.quantite) || 0))
      ttcArticles += ttc
      // Le taux figé à la vente fait toujours foi.
      const taux = la.tva_taux != null
        ? la.tva_taux
        : tauxPourArticle({ article: articlesParId[la.article_id], regime, tauxDefautCommerce: tauxDefaut })
      const cle = cleTaux(taux)
      parTaux[cle] = arrondi((parTaux[cle] || 0) + ttc)
    }

    // Les frais de livraison sont l'accessoire de la vente : ils suivent le
    // taux des marchandises livrées, et le taux le plus bas quand la commande
    // en mélange plusieurs. Ce taux a été figé à l'achat ; pour les commandes
    // antérieures on le reconstitue depuis les lignes.
    const fraisLivraison = arrondi(c.frais_livraison)
    if (fraisLivraison > 0) {
      const tauxLivraison = c.tva_taux_livraison != null
        ? c.tva_taux_livraison
        : tauxFraisLivraison(
            (c.commande_articles || []).map(la => la.tva_taux),
            tauxDefaut,
          )
      const cle = cleTaux(tauxLivraison)
      parTaux[cle] = arrondi((parTaux[cle] || 0) + fraisLivraison)
    }

    // Garde-fou : si le détail des lignes ne reconstitue pas le total (options,
    // remise, deal), on rattache l'écart au taux dominant plutôt que de le
    // perdre. Le chiffre d'affaires du journal doit égaler l'encaissement.
    const total = arrondi(c.total)
    const ecart = arrondi(total - ttcArticles - fraisLivraison)
    if (Math.abs(ecart) >= 0.01) {
      const cles = Object.keys(parTaux)
      const dominant = cles.length > 0
        ? cles.sort((a, b) => parTaux[b] - parTaux[a])[0]
        : cleTaux(tauxDefaut)
      parTaux[dominant] = arrondi((parTaux[dominant] || 0) + ecart)
    }

    const parBon = arrondi(c.bon_cadeau_montant)

    // ─── CE QUI EST EN CAISSE, ET CE QUI NE L'EST PAS ─────────────────────
    //
    // ⚠️ 🔴 LE JOURNAL AFFIRMAIT UN ENCAISSEMENT QUI N'AVAIT PAS EU LIEU.
    // « Encaisse au comptoir » portait le total de TOUTE commande non payée en
    // ligne, quel que soit son statut : une commande en préparation, une
    // commande prête que le client n'est pas venu chercher, une commande JAMAIS
    // RETIRÉE, toutes comptaient comme de l'argent dans le tiroir.
    //
    // ⚠️ ET LE FICHIER SE CONTREDISAIT DÉJÀ TOUT SEUL : la ventilation « dont
    // terminal / dont espèces » se fait sur le MOYEN déclaré. Sans moyen, le
    // montant tombait dans « au comptoir » et dans aucun « dont ». Le comptable
    // lisait « 240 € au comptoir, dont terminal 0, dont espèces 0 ».
    //
    // ⚠️ LA RÈGLE JUSTE ÉTAIT ÉCRITE TRENTE LIGNES PLUS BAS, POUR LES RENDEZ-
    // VOUS, depuis le 17/08 : « on n'écrit que ce qui a été DÉCLARÉ ». Elle
    // n'avait jamais été portée sur les commandes (feedback_appliquer_partout).
    //
    // ⚠️ ET LE MONTANT NE DISPARAÎT PAS POUR AUTANT : il passe en « reste à
    // encaisser », sinon le chiffre d'affaires ne s'expliquerait plus par ses
    // colonnes de règlement et l'écart ne serait dit nulle part
    // (feedback_information_complete). Arbitrage d'Alex, 23/08 :
    //     CA TTC = en ligne + au comptoir + bon cadeau + reste à encaisser
    //
    // ⚠️ `rien` NE COMPTE PAS COMME ENCAISSÉ, et c'est déjà ce que dit
    // `MODES_QUI_ENCAISSENT` : c'est une réponse, pas un moyen. Le client est
    // venu et n'a pas payé, donc l'argent n'est pas entré.
    const aRegler = c.paye_en_ligne ? 0 : arrondi(total - parBon)
    const encaissementDeclare = MODES_QUI_ENCAISSENT.includes(String(c.encaisse_mode || ''))

    lignes.push({
      date: jourComptable(c.date_commande, c.created_at),
      // Une commande payée en ligne est constatée à sa création ; une commande
      // réglée au comptoir, au moment où le commerçant l a encaissée.
      heure: heureComptable(c.paye_en_ligne ? c.created_at : c.encaisse_le, c.created_at),
      client: nomClientLigne(c.client_nom),
      type: 'Commande',
      canal: canalCommande(c),
      // ⚠️ LE MOYEN MANQUAIT ICI AUSSI. Le montant partait bien au comptoir,
      // mais un Click and Collect réglé en liquide et un autre au terminal se
      // ressemblaient comme deux gouttes d'eau, et la réconciliation était
      // impossible. Règle d'Alex du 17/08 : une amélioration qui touche
      // d'autres endroits de l'application s'y applique aussi.
      modeEncaissement: c.paye_en_ligne ? null : c.encaisse_mode,
      regime,
      // ⚠️ AVEC SON PRÉFIXE. Cette colonne rendait `4` là où le client, ses
      // emails et le tableau de bord lisent tous `CC4` : aucun rapprochement
      // n'était possible. Même défaut que l'écran de confirmation, corrigé le
      // 11/08, et jamais porté jusqu'ici.
      reference: referenceQualifiee(referenceCommande(c), c.numero_semaine) || String(c.id).slice(0, 8),
      total,
      parTaux,
      enLigne: c.paye_en_ligne ? arrondi(total - parBon) : 0,
      comptoir: encaissementDeclare ? aRegler : 0,
      resteAEncaisser: encaissementDeclare ? 0 : aRegler,
      bonCadeau: parBon,
      fraisStripe: montantStripe(c.paye_en_ligne ? total - parBon : 0, c.stripe_frais),
      netStripe: montantStripe(c.paye_en_ligne ? total - parBon : 0, c.stripe_net),
      statut: c.statut,
    })
  }

  for (const r of rdvs) {
    // ─── CE QUI A ÉTÉ ENCAISSÉ AU COMPTOIR ─────────────────────────────────
    //
    // ⚠️ IL MANQUAIT LA MOITIÉ DU JOURNAL (Alex, 17/08). L'export annonçait
    // « 1600 € en ligne, 0,00 € au comptoir » à un centre qui avait encaissé
    // treize séances à 15 € au terminal et en espèces : ces montants
    // n'existaient nulle part, donc aucune réconciliation n'était possible.
    //
    // ⚠️ ON N'ÉCRIT QUE CE QUI A ÉTÉ DÉCLARÉ, jamais un solde déduit du prix.
    // Un rendez-vous honoré sans encaissement noté ne produit aucune ligne :
    // supposer qu'il a été payé mettrait dans un document comptable de l'argent
    // que personne n'a vu passer.
    //
    // ⚠️ ET IL N'Y A AUCUN DOUBLE COMPTAGE AVEC L'ACOMPTE : le montant encaissé
    // est le SOLDE, calculé et figé au moment où le commerçant a répondu.
    const encaisse = arrondi(r.encaisse_montant)
    if (MODES_QUI_ENCAISSENT.includes(String(r.encaisse_mode || '')) && encaisse > 0) {
      const cleC = cleTaux(r.tva_taux != null ? r.tva_taux : tauxDefaut)
      lignes.push({
        date: jourComptable(r.encaisse_le, r.date_rdv),
        heure: heureComptable(r.encaisse_le),
        client: nomClientLigne(r.client_prenom, r.client_nom),
        type: 'Solde RDV',
        canal: 'Rendez-vous',
        regime: 'emporter',
        reference: referenceQualifiee(referenceRdv(r), r.numero_semaine) || String(r.id).slice(0, 8),
        total: encaisse,
        parTaux: { [cleC]: encaisse },
        // Encaissé chez le commerçant : Stripe n'a rien vu passer, donc aucun
        // frais et aucun net à déclarer ici.
        enLigne: 0,
        comptoir: encaisse,
        // Cette ligne n'existe QUE si l'encaissement a été déclaré : il ne
        // reste rien à encaisser dessus, par construction.
        resteAEncaisser: 0,
        modeEncaissement: r.encaisse_mode,
        bonCadeau: 0,
        // Rien n'est passé par Stripe : zéro est la vérité, pas une ignorance.
        fraisStripe: 0,
        netStripe: 0,
        statut: r.statut,
      })
    }

    // Seul l'ACOMPTE transite par Yoppaa. Le solde ci-dessus n'y transite pas
    // non plus : c'est le commerçant qui le déclare, et il est marqué comme
    // encaissé au comptoir, jamais en ligne.
    const acompte = arrondi(r.acompte_montant)
    if (!r.acompte_paye || acompte <= 0) continue
    const cle = cleTaux(r.tva_taux != null ? r.tva_taux : tauxDefaut)
    lignes.push({
      date: (r.date_rdv || '').slice(0, 10),
      // L acompte est payé en ligne au moment de la réservation.
      heure: heureComptable(r.acompte_paye_date, r.created_at),
      client: nomClientLigne(r.client_prenom, r.client_nom),
      type: 'Acompte RDV',
      canal: 'Rendez-vous',
      regime: 'emporter',
      reference: referenceQualifiee(referenceRdv(r), r.numero_semaine) || String(r.id).slice(0, 8),
      total: acompte,
      parTaux: { [cle]: acompte },
      enLigne: r.acompte_paye_en_ligne ? acompte : 0,
      comptoir: r.acompte_paye_en_ligne ? 0 : acompte,
      // Cette ligne n'existe que si l'acompte est marqué PAYÉ (`acompte_paye`) :
      // il ne reste rien à encaisser dessus non plus.
      resteAEncaisser: 0,
      bonCadeau: 0,
      fraisStripe: montantStripe(r.acompte_paye_en_ligne ? acompte : 0, r.stripe_frais),
      netStripe: montantStripe(r.acompte_paye_en_ligne ? acompte : 0, r.stripe_net),
      statut: r.statut,
    })
  }

  // ─── LES ABONNEMENTS ──────────────────────────────────────────────────────
  //
  // ⚠️ ILS N'EXISTAIENT DANS AUCUN DOCUMENT COMPTABLE (Alex, 17/08). La vente
  // d'un abonnement n'écrit que dans `abonnements`, jamais une commande, et cet
  // export ne lisait que les commandes et les rendez-vous. Un contrat de 540 €
  // réellement encaissé par Stripe ne figurait donc nulle part.
  //
  // ⚠️ LA LIGNE PORTE LA DATE DE L'ENCAISSEMENT (décision d'Alex, 17/08), pas
  // celle de la première séance ni un étalement sur la durée du contrat. C'est
  // ce que fait la banque, et c'est le seul jour où de l'argent a bougé.
  // L'étalement en produits constatés d'avance est un travail de comptable :
  // le faire ici, ce serait décider à sa place sur un document qu'il signe.
  for (const a of abonnements) {
    // Non payé, c'est un contrat en attente : rien n'a été encaissé, donc rien
    // à écrire. Un montant nul non plus.
    if (!a || !a.paye) continue
    const montant = arrondi(a.prix)
    if (montant <= 0) continue
    // Sans date d'encaissement, la ligne n'aurait pas de jour : on ne l'invente
    // pas, on la laisse de côté plutôt que de la rattacher au mauvais mois.
    const date = jourComptable(a.paye_le)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const enLigne = String(a.mode_paiement || '') === 'en_ligne'
    // Le taux figé à la vente fait foi ; sinon le taux par défaut du commerce ;
    // sinon la colonne « non renseigné », qui se voit. Jamais un taux inventé.
    const cle = cleTaux(a.tva_taux != null ? a.tva_taux : tauxDefaut)
    lignes.push({
      date,
      heure: heureComptable(a.paye_le),
      client: nomClientLigne(a.client_prenom, a.client_nom),
      type: 'Abonnement',
      canal: 'Abonnement',
      // Une prestation de services : jamais de consommation en salle.
      regime: 'emporter',
      // Aucune semaine : la serie des contrats est CONTINUE, donc ABT7 se
      // suffit a lui-meme la ou RV7 a besoin de la sienne.
      reference: referenceAbonnement(a) || String(a.id || '').slice(0, 8),
      total: montant,
      parTaux: { [cle]: montant },
      enLigne: enLigne ? montant : 0,
      comptoir: enLigne ? 0 : montant,
      // Un abonnement n'entre au journal qu'une fois PAYÉ : rien ne reste dû.
      resteAEncaisser: 0,
      // `sur_place` sans plus de précision reste possible : c'est ce que
      // portaient les inscriptions faites avant que le moyen soit demandé.
      modeEncaissement: enLigne ? null : a.mode_paiement,
      bonCadeau: 0,
      fraisStripe: montantStripe(enLigne ? montant : 0, a.stripe_frais),
      netStripe: montantStripe(enLigne ? montant : 0, a.stripe_net),
      statut: a.statut,
    })
  }

  return lignes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// ⚠️ LE CANAL SE LIT SUR LE PRÉFIXE, ET LA RAISON EST QU'IL CONTREDISAIT LA
// COLONNE D'À CÔTÉ (question d'Alex, 19/08 : « ça s'applique aussi au C&C, RE,
// et à tout le reste ? »). Une ligne annonçait « Click & Collect » avec la
// référence `RE12` juste à droite.
//
// Deux fautes dans l'ancienne version :
//
// 1. `mode_retrait` NE DISTINGUE PAS le Click and Collect du retrait en
//    magasin : les deux valent `retrait`. C'est le CRÉNEAU qui les sépare, et
//    c'est écrit noir sur blanc dans la migration de numérotation, qui prend
//    soin de cette distinction depuis le 10/08.
// 2. La branche « boutique » ÉTAIT MORTE. La contrainte de la base n'accepte
//    que `retrait`, `livraison` et `expedition` : ce libellé n'a jamais pu
//    s'afficher, et personne ne s'en est aperçu puisque le repli rendait
//    quelque chose de plausible.
//
// Le préfixe est décidé à l'insertion par le déclencheur, avec exactement la
// règle voulue. Le lire ici, c'est garantir que le canal et la référence ne
// peuvent PLUS se contredire : ils viennent de la même source.
function canalCommande(c) {
  switch (String(c.numero_prefixe || '')) {
    case 'LI': return 'Livraison'
    case 'EX': return 'Expédition'
    case 'CC': return 'Click & Collect'
    case 'RE': return 'Retrait en magasin'
  }
  // Commandes d'avant la numérotation du 10/08 : elles n'ont pas de préfixe. On
  // retombe sur les colonnes, avec la MÊME règle que le déclencheur.
  const mode = String(c.mode_retrait || '')
  if (mode === 'livraison') return 'Livraison'
  if (mode === 'expedition') return 'Expédition'
  return c.creneau_id ? 'Click & Collect' : 'Retrait en magasin'
}

// ⚠️ UN FRAIS INCONNU N'EST PAS UN FRAIS NUL, ET UN FRAIS NUL N'EST PAS INCONNU.
// Deux situations que le journal confondait, en écrivant `0,00` dans les deux
// cas. Alex, 19/08 : son récapitulatif annonçait « 0,00 € de frais Stripe » sur
// 1600 € encaissés en ligne, ce qui se lit « Stripe ne t'a rien coûté » alors
// que la bonne lecture est « on ne l'a jamais relevé ».
//
// La règle tient en une ligne : rien n'est passé par Stripe sur cette ligne, le
// frais vaut ZÉRO et l'écrire est une information ; de l'argent y est passé
// sans qu'on ait relevé le frais, la case reste VIDE.
export function montantStripe(enLigne, brut) {
  if (!(Number(enLigne) > 0)) return 0
  return brut == null ? null : arrondi(brut)
}

// ⚠️ ADDITIONNER EN GARDANT L'IGNORANCE. Une seule ligne au frais inconnu rend
// le total du jour inconnu : un total partiel se lirait comme un total complet,
// et c'est précisément le mensonge qu'on vient de corriger.
export function sommeStripe(cumul, ajout) {
  if (cumul === null || ajout === null) return null
  return arrondi(cumul + ajout)
}

// Regroupe les lignes par journée : c'est le rapport de caisse quotidien.
export function journalParJour(lignes) {
  const jours = new Map()
  for (const l of lignes) {
    if (!jours.has(l.date)) {
      jours.set(l.date, {
        date: l.date, nb: 0, total: 0, parTaux: {},
        enLigne: 0, comptoir: 0, resteAEncaisser: 0, bonCadeau: 0, fraisStripe: 0, netStripe: 0,
        // ⚠️ LA RÉCONCILIATION SE FAIT SUR CES DEUX-LÀ, et c'est toute la
        // raison d'être du geste d'encaissement : en fin de journée, le
        // commerçant recoupe le relevé de son terminal et le contenu de son
        // tiroir. Un total « au comptoir » qui mélange les deux ne l'aide pas.
        // ⚠️ TROIS SEAUX, PAS DEUX. Un virement n'est ni dans le tiroir ni sur
        // le relevé du terminal : le noyer dans « au comptoir » ferait chercher
        // un montant qui ne se recoupe avec rien.
        terminal: 0, especes: 0, virement: 0,
      })
    }
    const j = jours.get(l.date)
    j.nb += 1
    j.total = arrondi(j.total + l.total)
    j.enLigne = arrondi(j.enLigne + l.enLigne)
    j.comptoir = arrondi(j.comptoir + l.comptoir)
    // ⚠️ REPLI À ZÉRO PLUTÔT QUE `NaN` DANS UN DOCUMENT COMPTABLE : une ligne
    // d'un type qui oublierait le champ ne doit pas empoisonner tout le total
    // du jour. C'est le BANC qui exige que chaque ligne le porte, pas le repli.
    j.resteAEncaisser = arrondi(j.resteAEncaisser + (Number(l.resteAEncaisser) || 0))
    if (l.modeEncaissement === 'terminal') j.terminal = arrondi(j.terminal + l.comptoir)
    if (l.modeEncaissement === 'especes') j.especes = arrondi(j.especes + l.comptoir)
    if (l.modeEncaissement === 'virement') j.virement = arrondi(j.virement + l.comptoir)
    j.bonCadeau = arrondi(j.bonCadeau + l.bonCadeau)
    j.fraisStripe = sommeStripe(j.fraisStripe, l.fraisStripe)
    j.netStripe = sommeStripe(j.netStripe, l.netStripe)
    for (const [cle, ttc] of Object.entries(l.parTaux)) {
      j.parTaux[cle] = arrondi((j.parTaux[cle] || 0) + ttc)
    }
  }
  return [...jours.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

// Toutes les clés de taux réellement rencontrées : les colonnes du fichier
// s'adaptent au commerce plutôt que d'imposer une grille figée. Le marqueur
// « non renseigné » est toujours rejeté en fin de tableau.
export function tauxRencontres(lignes) {
  const s = new Set()
  for (const l of lignes) for (const c of Object.keys(l.parTaux)) s.add(c)
  const cles = [...s]
  const nr = cles.filter(c => c === TAUX_NON_RENSEIGNE)
  const nombres = cles.filter(c => c !== TAUX_NON_RENSEIGNE).map(Number).sort((a, b) => a - b)
  return [...nombres, ...nr]
}

// ─── Fabrication du CSV ──────────────────────────────────────────────────────
// Séparateur point-virgule et virgule décimale : c'est ce qu'attend Excel en
// version belge ou française. Un BOM UTF-8 en tête, sans quoi Excel massacre
// les accents à l'ouverture.

const BOM = '﻿'

function nombre(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',')
}
function champ(v) {
  const s = String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function ligneCsv(cells) {
  return cells.map(champ).join(';')
}

function entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants }) {
  const l = [
    ligneCsv([`Export comptable Yoppaa - ${commercant?.nom || ''}`]),
    ligneCsv([`Periode du ${du} au ${au}`]),
    ligneCsv([`Numero d entreprise ${commercant?.bce || ''}`]),
    ligneCsv(['Document d aide a la comptabilite. Yoppaa n est pas un systeme de caisse enregistree certifie (SCE) : ce fichier ne remplace pas une caisse certifiee.']),
    ligneCsv(['En cas de doute sur un taux applicable, consultez votre comptable ou le SPF Finances.']),
  ]
  if (!assujetti) l.push(ligneCsv(['Commerce non assujetti a la TVA : aucune ventilation n est calculee.']))
  if (avertissementTaux) l.push(ligneCsv(['Certaines transactions anterieures a la mise en place des taux utilisent le taux actuel de l article.']))
  if (tauxManquants) l.push(ligneCsv(['ATTENTION : des articles n ont aucun taux renseigne. Leur montant figure dans la colonne "Taux non renseigne" et n est pas ventile.']))
  l.push('')
  return l
}

function colonnesTaux(taux) {
  return taux.flatMap(t => [`Base ${libelleTaux(t)}`, `TVA ${libelleTaux(t)}`])
}

export function csvJournal({ lignes, commercant, du, au, assujetti = true, avertissementTaux = false }) {
  const jours = journalParJour(lignes)
  const taux = assujetti ? tauxRencontres(lignes) : []
  const tauxManquants = taux.includes(TAUX_NON_RENSEIGNE)
  const out = entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants })

  // ⚠️ « RESTE A ENCAISSER » FERME LE COMPTE : sans elle, le CA ne s'expliquait
  // plus par ses colonnes de règlement une fois l'encaissement conditionné au
  // relevé réel, et l'écart n'était dit nulle part. Arbitrage d'Alex, 23/08 :
  //     CA TTC = en ligne + au comptoir + bon cadeau + reste a encaisser
  out.push(ligneCsv([
    'Date', 'Nb transactions', 'CA TTC', ...colonnesTaux(taux),
    'Encaisse en ligne', 'Encaisse au comptoir', 'Dont terminal', 'Dont especes', 'Dont virement',
    'Paye par bon cadeau', 'Reste a encaisser', 'Frais Stripe', 'Net Stripe',
  ]))

  const totaux = { nb: 0, total: 0, enLigne: 0, comptoir: 0, reste: 0, terminal: 0, especes: 0, virement: 0, bonCadeau: 0, frais: 0, net: 0, base: {}, tva: {} }
  for (const j of jours) {
    const cells = [j.date, j.nb, nombre(j.total)]
    for (const t of taux) {
      const { base, tva } = ventiler(j.parTaux[t] || 0, t === TAUX_NON_RENSEIGNE ? null : t)
      cells.push(nombre(base), nombre(tva))
      totaux.base[t] = arrondi((totaux.base[t] || 0) + base)
      totaux.tva[t] = arrondi((totaux.tva[t] || 0) + tva)
    }
    cells.push(nombre(j.enLigne), nombre(j.comptoir), nombre(j.terminal), nombre(j.especes), nombre(j.virement),
      nombre(j.bonCadeau), nombre(j.resteAEncaisser),
      j.fraisStripe == null ? '' : nombre(j.fraisStripe), j.netStripe == null ? '' : nombre(j.netStripe))
    out.push(ligneCsv(cells))
    totaux.nb += j.nb
    totaux.total = arrondi(totaux.total + j.total)
    totaux.enLigne = arrondi(totaux.enLigne + j.enLigne)
    totaux.comptoir = arrondi(totaux.comptoir + j.comptoir)
    totaux.terminal = arrondi(totaux.terminal + j.terminal)
    totaux.especes = arrondi(totaux.especes + j.especes)
    totaux.virement = arrondi(totaux.virement + (j.virement || 0))
    totaux.bonCadeau = arrondi(totaux.bonCadeau + j.bonCadeau)
    totaux.reste = arrondi(totaux.reste + j.resteAEncaisser)
    totaux.frais = sommeStripe(totaux.frais, j.fraisStripe)
    totaux.net = sommeStripe(totaux.net, j.netStripe)
  }

  const fin = ['TOTAL', totaux.nb, nombre(totaux.total)]
  for (const t of taux) fin.push(nombre(totaux.base[t] || 0), nombre(totaux.tva[t] || 0))
  fin.push(nombre(totaux.enLigne), nombre(totaux.comptoir), nombre(totaux.terminal), nombre(totaux.especes),
    nombre(totaux.virement), nombre(totaux.bonCadeau), nombre(totaux.reste),
    totaux.frais == null ? '' : nombre(totaux.frais), totaux.net == null ? '' : nombre(totaux.net))
  out.push('')
  out.push(ligneCsv(fin))

  return BOM + out.join('\r\n')
}

export function csvDetail({ lignes, commercant, du, au, assujetti = true, avertissementTaux = false }) {
  const taux = assujetti ? tauxRencontres(lignes) : []
  const tauxManquants = taux.includes(TAUX_NON_RENSEIGNE)
  const out = entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants })

  // ⚠️ L'HEURE ET LE CLIENT NE SONT QUE DANS LE DÉTAIL, jamais dans le journal :
  // le journal agrège par JOUR, une heure et un nom n'y voudraient rien dire.
  out.push(ligneCsv([
    'Date', 'Heure', 'Client', 'Type', 'Canal', 'Regime', 'Reference', 'Statut', 'Moyen au comptoir', 'Montant TTC', ...colonnesTaux(taux),
    'Encaisse en ligne', 'Encaisse au comptoir', 'Paye par bon cadeau', 'Reste a encaisser', 'Frais Stripe', 'Net Stripe',
  ]))

  for (const l of lignes) {
    // Le moyen déclaré par le commerçant, pour que le comptable retrouve chaque
    // ligne dans le relevé du terminal ou dans le comptage de caisse.
    const moyen = MODES_ENCAISSEMENT[String(l.modeEncaissement || '')]?.label || ''
    const cells = [l.date, l.heure || '', l.client || '', l.type, l.canal, l.regime === 'sur_place' ? 'Sur place' : 'A emporter', l.reference, l.statut, moyen, nombre(l.total)]
    for (const t of taux) {
      const { base, tva } = ventiler(l.parTaux[t] || 0, t === TAUX_NON_RENSEIGNE ? null : t)
      cells.push(nombre(base), nombre(tva))
    }
    // ⚠️ UN FRAIS INCONNU N EST PAS UN FRAIS NUL. `0,00` affirmait qu il n y
    // en avait pas eu, alors que la verite est qu on ne l a jamais releve : la
    // colonne reste vide, comme sa voisine Net Stripe le faisait deja. Piege du
    // zero, deja vecu deux fois sur ce projet (Alex, 19/08).
    cells.push(nombre(l.enLigne), nombre(l.comptoir), nombre(l.bonCadeau), nombre(Number(l.resteAEncaisser) || 0), l.fraisStripe == null ? '' : nombre(l.fraisStripe), l.netStripe == null ? '' : nombre(l.netStripe))
    out.push(ligneCsv(cells))
  }

  return BOM + out.join('\r\n')
}
