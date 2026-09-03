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
import { partRemboursee } from './remboursements'
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 CE JOURNAL COMPTAIT DE L'ARGENT QUI ÉTAIT REPARTI (02/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Trois trous, de la même famille, et un seul d'entre eux était couvert :
//
// 1. La boucle des commandes filtre par statut. Celle des rendez-vous ne
//    filtrait RIEN, et `STATUTS_EXCLUS` ne contient AUCUN statut de rendez-
//    vous. Une ligne « Acompte RDV » partait donc chez le comptable, avec son
//    montant, ses frais et son net, pour de l'argent rendu au client.
// 2. Un remboursement PARTIEL de commande garde volontairement son statut
//    (webhook Stripe : « commande honorée + remboursement partiel »). Une
//    commande de 60 € remboursée de 20 € était écrite 60 €.
// 3. Un rendez-vous payé par bon cadeau et annulé garde `bon_cadeau_montant` :
//    `rendreAvantagesRdv` recrédite le bon mais ne touche pas la colonne. Une
//    coupe de 35 € payée par bon, annulée, restait 35 € de chiffre d'affaires.
//
// ⚠️ ON COMPTE CE QUI EST RESTÉ, PAS UNE LISTE DE STATUTS. Une annulation qui
// GARDE l'acompte en dédommagement reste comptée, et c'est juste : le
// commerçant l'a gagné. Le no-show écrit sa garantie tout seul, sans cas
// particulier. Et la règle ne devient pas fausse au prochain statut inventé.
//
// ✅ DEUX ARBITRAGES D'ALEX, 31/08 :
//   1. UNE LIGNE DE REMBOURSEMENT À SA DATE, jamais un net posé sur la ligne
//      d'origine. Le relevé bancaire montre DEUX mouvements à deux dates : un
//      journal qui n'en montre qu'un ne se rapproche de rien. C'est une
//      contrepassation, et c'est le geste comptable normal.
//   2. UNE VENTE RAMENÉE À ZÉRO RESTE VISIBLE, ET PORTE LE FRAIS RETENU.
//      Stripe ne restitue pas ses frais sur un remboursement : c'est un coût
//      réel du commerçant, et il ne figurait dans aucun document.

// ⚠️ LE PLAFOND VIT DANS `lib/remboursements.js`, ET PAS ICI, parce que le
// TABLEAU DE BORD en a besoin du mot pour mot : lui aussi comptait une commande
// partiellement remboursée pour son montant entier. Recopier la règle, c'est se
// garantir qu'une des deux copies dérivera au premier correctif.
export { partRemboursee }

// Ventile le remboursement sur les taux de la vente d'origine : exact sur un
// remboursement total, honnête sur un partiel. Le dernier taux absorbe l'écart
// d'arrondi, sans quoi la somme des colonnes ne redonnerait pas le montant.
export function prorataTaux(parTaux, part, total) {
  const t = Number(total)
  const p = Number(part)
  const cles = Object.keys(parTaux || {})
  if (cles.length === 0 || !(t > 0) || !(p > 0)) return {}
  const ratio = p / t
  const out = {}
  let pose = 0
  cles.forEach((cle, i) => {
    const brut = i === cles.length - 1
      ? arrondi(p - pose)
      : arrondi((Number(parTaux[cle]) || 0) * ratio)
    pose = arrondi(pose + brut)
    out[cle] = arrondi(-brut)
  })
  return out
}

// ⚠️ `stripe_frais` ET `stripe_net` NE SONT PAS DANS LE MÊME TEMPS, et c'est le
// piège de tout ce chantier. Après un remboursement, `netApresRemboursement`
// n'écrit QUE le net : `stripe_frais` reste celui d'origine, `stripe_net` porte
// déjà la sortie d'argent.
//
// 🔴 ÉCRIRE UNE CONTREPASSATION SANS LE SAVOIR DÉDUIRAIT DEUX FOIS. Sur une
// vente de 100 € à 2,50 € de frais, remboursée en entier, `stripe_net` vaut
// -2,50 : la ligne d'origine aurait affiché -2,50 de net et la contrepassation
// -100, soit -102,50 pour une perte réelle de 2,50 €.
//
// La ligne d'origine porte donc le net DU JOUR DE LA VENTE, reconstitué depuis
// le frais qui, lui, n'a pas bougé. La sortie d'argent est portée par la
// contrepassation, une seule fois. Les deux lignes s'additionnent alors
// exactement à ce que Stripe a laissé sur le compte.
export function netAvantRemboursement(base, frais, net, rembourse) {
  if (!(Number(base) > 0)) return 0
  if (!(Number(rembourse) > 0)) return net == null ? null : arrondi(net)
  // Sans le frais d'origine, le net du jour de la vente est indéterminable :
  // une case vide s'interprète, un chiffre reconstitué de travers se croit.
  if (frais == null) return null
  return arrondi(Number(base) - Number(frais))
}

// Les retours de bons cadeaux, chacun À SA DATE et plafonnés à ce que la ligne
// portait. Un bon rendu en deux fois donne deux contrepassations, ce qui est
// exactement ce que montre le compte du client.
export function retoursPlafonnes(mouvements, plafond) {
  let reste = arrondi(plafond)
  const out = []
  for (const m of (mouvements || [])) {
    if (reste <= 0) break
    const part = arrondi(Math.min(Number(m?.montant) || 0, reste))
    if (part <= 0) continue
    out.push({ montant: part, date: m?.created_at || null, sur: 'bon' })
    reste = arrondi(reste - part)
  }
  return out
}

/**
 * La ligne négative d'un remboursement, datée du jour où l'argent est reparti.
 *
 * ⚠️ ELLE NE PORTE PAS `referenceIncomplete`. Sa référence est celle de la
 * vente, déjà comptée par l'avertissement d'en-tête : la compter deux fois
 * annoncerait plus de transactions ambiguës qu'il n'y en a.
 */
export function ligneRemboursement(origine, { montant, date, sur = 'carte' } = {}) {
  const part = arrondi(montant)
  if (!origine || !(part > 0)) return null
  // Sans jour, la ligne tomberait dans une colonne vide du journal. On retombe
  // sur le jour de la vente plutôt que de la perdre : le montant est réel.
  const jour = jourComptable(date) || origine.date
  if (!jour) return null
  const surBon = sur === 'bon'
  return {
    date: jour,
    heure: heureComptable(date),
    client: origine.client,
    type: 'Remboursement',
    canal: origine.canal,
    // Un remboursement ne repasse pas par le tiroir : le rendu en espèces au
    // comptoir n'existe pas dans l'application, et l'inventer ici ferait
    // chercher un mouvement introuvable dans le comptage de caisse.
    modeEncaissement: null,
    regime: origine.regime,
    reference: origine.reference,
    total: arrondi(-part),
    parTaux: prorataTaux(origine.parTaux, part, origine.total),
    enLigne: surBon ? 0 : arrondi(-part),
    comptoir: 0,
    resteAEncaisser: 0,
    // Un bon recrédité rend au client de l'argent déjà entré en caisse le jour
    // de la vente du bon : c'est la colonne « bon cadeau » qui baisse, pas
    // l'encaissement en ligne, qui n'a rien vu passer.
    bonCadeau: surBon ? arrondi(-part) : 0,
    // ⚠️ ZÉRO EST UNE INFORMATION ICI, PAS UNE IGNORANCE : Stripe ne prélève
    // aucun frais supplémentaire sur un remboursement, et ne restitue pas ceux
    // de la vente. Le frais de la vente reste donc sur sa ligne, et la somme
    // des deux lignes montre exactement ce qu'il a coûté.
    fraisStripe: 0,
    netStripe: surBon ? 0 : arrondi(-part),
    statut: origine.statut,
    remboursement: true,
  }
}

// ⚠️ UNE CONTREPASSATION APPARTIENT À SA PÉRIODE, PAS À CELLE DE LA VENTE. Un
// rendez-vous du 28 février annulé le 2 mars sort dans l'export de MARS. Sans
// cette borne, il polluait février (où il n'a pas eu lieu) et manquait à mars
// (où l'argent est réellement parti) : faux des deux côtés.
export function dansPeriode(date, periode) {
  if (!periode || !periode.du || !periode.au) return true
  return date >= periode.du && date <= periode.au
}

// Regroupe les retours de bons par cible, triés par date : chaque mouvement
// garde la sienne.
export function indexerRetoursBons(mouvements = []) {
  const parCommande = new Map()
  const parRdv = new Map()
  const ranges = [...(mouvements || [])]
    .filter(m => m && Number(m.montant) > 0)
    .sort((a, b) => String(a.created_at || '') < String(b.created_at || '') ? -1 : 1)
  for (const m of ranges) {
    const cible = m.commande_id ? parCommande : m.rdv_id ? parRdv : null
    if (!cible) continue
    const cle = m.commande_id || m.rdv_id
    if (!cible.has(cle)) cible.set(cle, [])
    cible.get(cle).push(m)
  }
  return { parCommande, parRdv }
}

// Construit les lignes normalisées à partir des commandes et des rendez-vous.
// Chaque ligne porte déjà sa ventilation : le journal comme le détail s'en
// déduisent, sans recalculer deux fois selon deux logiques.
//
// `articlesParId` sert de filet pour les commandes antérieures au figement des
// taux : on retombe alors sur le taux actuel de l'article, et l'en-tête du
// fichier le signale honnêtement.
//
// `retoursBons` porte les mouvements de re-crédit (`source = 'annulation'`) :
// c'est la SEULE source de vérité de ce qui est reparti sur un bon, et elle
// porte sa date. Aucune colonne ne le dit : `rendreAvantagesRdv` recrédite le
// bon sans toucher `bon_cadeau_montant`, et le no-show n'en rend qu'une part.
//
// `periode` borne CHAQUE ligne sur sa propre date d'écriture. La route peut
// donc charger large sans risque : ce qui n'appartient pas à la période s'en
// exclut tout seul, et rien ne se perd puisque chaque mouvement sort dans
// l'export du mois où l'argent a bougé.
export function construireLignes({
  commandes = [], rdvs = [], abonnements = [], tauxDefaut = null, articlesParId = {},
  retoursBons = [], periode = null,
}) {
  const lignes = []
  const retours = indexerRetoursBons(retoursBons)

  // ⚠️ LA CONTREPASSATION SE CONSTRUIT DEPUIS LA LIGNE D'ORIGINE, MÊME QUAND
  // CELLE-CI NE SORT PAS : c'est elle qui porte la ventilation par taux, la
  // référence et le canal. On la fabrique donc toujours, et on décide ensuite
  // laquelle des deux appartient à cette période.
  //
  // ⚠️ ET ON NE CONTREPASSE QUE CE QUI A PRODUIT UNE LIGNE. Soustraire un
  // remboursement d'un chiffre d'affaires jamais écrit — une commande annulée,
  // que son statut exclut déjà — creuserait un trou au lieu d'en combler un.
  const poser = (ligne, { remboursements = [] } = {}) => {
    // ⚠️ CHAQUE LIGNE EST JUGÉE SUR SA PROPRE DATE, la vente comme son
    // remboursement. C'est ce qui remplace la liste des ventes « hors période »
    // du 02/09 : une vente chargée pour son remboursement s'exclut désormais
    // toute seule, par sa date d'écriture, et il n'y a plus deux façons de
    // répondre à la même question.
    if (dansPeriode(ligne.date, periode)) lignes.push(ligne)
    for (const r of remboursements) {
      const negative = ligneRemboursement(ligne, r)
      if (negative && dansPeriode(negative.date, periode)) lignes.push(negative)
    }
    return ligne
  }

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

    // ─── LA RÉCOMPENSE DE FIDÉLITÉ N'EST PAS UN RÈGLEMENT, C'EST UNE REMISE ─
    //
    // ⚠️ ELLE DOIT DONC BAISSER LE CHIFFRE D'AFFAIRES, pas apparaître dans une
    // colonne d'encaissement. Un bon cadeau est de l'argent déjà entré en
    // caisse le jour de sa vente : il règle. Une récompense n'a jamais été
    // payée par personne : le commerçant a simplement vendu moins cher.
    //
    // ⚠️ ET C'EST L'INVARIANT D'ALEX (23/08) QUI L'IMPOSE :
    //     CA TTC = en ligne + au comptoir + bon cadeau + reste à encaisser
    // En gardant le total brut, la somme des colonnes serait inférieure au CA
    // du montant de la remise, sans que rien ne l'explique. Le journal ne
    // s'expliquerait plus par ses propres colonnes.
    const parRecompense = arrondi(c.fidelite_remise)
    const totalNet = arrondi(total - parRecompense)

    // ⚠️ L'ÉCART SE MESURE SUR LE NET. La remise se retrouve ainsi rattachée
    // au taux dominant, exactement comme les autres écarts de reconstitution.
    const ecart = arrondi(totalNet - ttcArticles - fraisLivraison)
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
    const aRegler = c.paye_en_ligne ? 0 : arrondi(totalNet - parBon)
    const encaissementDeclare = MODES_QUI_ENCAISSENT.includes(String(c.encaisse_mode || ''))
    const surCarte = c.paye_en_ligne ? arrondi(totalNet - parBon) : 0

    // ⚠️ LE PLAFOND EST CE QUE LA CARTE A PAYÉ, PAS LE PRIX DE VENTE. Stripe ne
    // rembourse jamais la part réglée par un bon cadeau : la lui imputer
    // baisserait le chiffre d'affaires d'un argent qui, lui, est bien resté.
    const rembCarte = partRemboursee(c.stripe_refund_amount, surCarte)
    const remboursements = rembCarte > 0
      ? [{ montant: rembCarte, date: c.stripe_refund_date, sur: 'carte' }]
      : []
    // Les bons rendus sur une commande : en pratique son annulation l'exclut
    // déjà du journal, mais un re-crédit sur une commande qui reste comptée
    // (remboursement partiel, geste commercial) doit se voir.
    remboursements.push(...retoursPlafonnes(retours.parCommande.get(c.id), parBon))

    poser({
      // ⚠️ 🔴 LA DATE ET L'HEURE VENAIENT DE DEUX INSTANTS DIFFÉRENTS (03/09).
      // La ligne juste en dessous constate depuis toujours l'heure du PAIEMENT,
      // et la date, elle, était celle du RETRAIT : la même case annonçait donc
      // « le 4 août à 08h07 » pour un paiement fait la veille à 08h07. Un
      // comptable qui remonte le relevé de la banque ne trouve rien ce jour-là.
      //
      // ⚠️ ET C'EST LA RÈGLE QUE CE FICHIER SE DONNE À LUI-MÊME trente lignes
      // plus haut : le jour de l'écriture est celui où l'argent a été constaté,
      // jamais celui du créneau de retrait. Elle est appliquée à l'abonnement
      // depuis le 17/08 par arbitrage d'Alex : « la ligne porte la date de
      // l'encaissement, pas celle de la première séance ».
      date: jourComptable(
        c.paye_en_ligne ? c.created_at : c.encaisse_le,
        // Ni payée en ligne ni encaissée : rien n'est entré en caisse, la ligne
        // ne porte que du « reste à encaisser ». Son jour reste celui du
        // retrait prévu, faute de mieux, plutôt que de disparaître.
        c.date_commande, c.created_at,
      ),
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
      // ⚠️ SANS SA SEMAINE, UNE RÉFÉRENCE PEUT SE RÉPÉTER : le compteur repart
      // à 1 chaque semaine. On le marque pour le dire en tête de fichier.
      ...refLigne(referenceQualifiee(referenceCommande(c), c.numero_semaine) || String(c.id).slice(0, 8)),
      // ⚠️ LE CA EST LE NET DE REMISE. C'est ce que le commerçant a réellement
      // vendu, et c'est le seul chiffre qui s'explique par les colonnes de
      // règlement qui suivent.
      total: totalNet,
      parTaux,
      enLigne: surCarte,
      comptoir: encaissementDeclare ? aRegler : 0,
      resteAEncaisser: encaissementDeclare ? 0 : aRegler,
      bonCadeau: parBon,
      fraisStripe: montantStripe(surCarte, c.stripe_frais),
      netStripe: netAvantRemboursement(surCarte, c.stripe_frais, c.stripe_net, rembCarte),
      statut: c.statut,
    }, { id: c.id, remboursements })
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
      poser({
        date: jourComptable(r.encaisse_le, r.date_rdv),
        heure: heureComptable(r.encaisse_le),
        client: nomClientLigne(r.client_prenom, r.client_nom),
        type: 'Solde RDV',
        canal: 'Rendez-vous',
        regime: 'emporter',
        ...refLigne(referenceQualifiee(referenceRdv(r), r.numero_semaine) || String(r.id).slice(0, 8)),
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
        // Un solde encaissé au comptoir ne se rembourse pas par l'application :
        // le geste existe en caisse, pas dans Yoppaa, et rien ne l'enregistre.
      }, { id: r.id })
    }

    // ─── 🔴 LA PART PAYÉE PAR UN BON CADEAU ────────────────────────────────
    //
    // ELLE N'EXISTAIT NULLE PART DANS CE JOURNAL (Alex, 29/08). Les lignes de
    // rendez-vous portaient `bonCadeau: 0` EN DUR, alors que la colonne existe
    // sur la table depuis le 28/08 et que la commande, elle, a la sienne.
    //
    // ⚠️ ET LE RENDEZ-VOUS DISPARAISSAIT ENTIÈREMENT quand le bon couvrait
    // tout : sans acompte, la boucle passait au suivant deux lignes plus bas.
    // Une coupe à 35 € réglée par un bon de 35 € ne figurait donc dans AUCUN
    // document comptable, ni en ligne, ni au comptoir, ni en bon.
    //
    // ⚠️ CE N'EST NI « EN LIGNE » NI « COMPTOIR », et c'est tout l'intérêt de
    // la colonne : l'argent est entré en caisse le jour où quelqu'un a ACHETÉ
    // le bon, et cette vente-là a sa propre ligne. Le compter une seconde fois
    // ici doublerait le chiffre d'affaires ; ne pas le montrer du tout
    // laisserait le commerçant chercher une prestation qu'il a bien rendue.
    // ⚠️ 🔴 ET CE BON POUVAIT ÊTRE DÉJÀ REPARTI (02/09). `rendreAvantagesRdv`
    // recrédite le bon à l'annulation et au no-show, mais ne remet JAMAIS
    // `bon_cadeau_montant` à zéro : la colonne dit ce que le bon a payé, pas ce
    // qu'il a fini par payer. Une coupe de 35 € réglée par bon puis annulée
    // restait donc 35 € de chiffre d'affaires, sur un argent rendu au client.
    const parBonRdv = arrondi(r.bon_cadeau_montant)
    if (parBonRdv > 0) {
      const cleB = cleTaux(r.tva_taux != null ? r.tva_taux : tauxDefaut)
      poser({
        // ⚠️ 🔴 LE JOUR DE LA RÉSERVATION, PAS CELUI DU RENDEZ-VOUS (03/09). Le
        // bon est débité au moment où le client réserve : c'est là que le
        // commerçant acquiert la prestation payée. Daté du rendez-vous, ce
        // mouvement apparaissait APRÈS son propre remboursement quand
        // l'annulation tombait avant la date prévue, et Alex l'a vu sept fois
        // dans un seul export.
        date: jourComptable(r.acompte_paye_date, r.created_at, r.date_rdv),
        heure: heureComptable(r.acompte_paye_date, r.created_at),
        client: nomClientLigne(r.client_prenom, r.client_nom),
        type: 'Bon cadeau RDV',
        canal: 'Rendez-vous',
        regime: 'emporter',
        ...refLigne(referenceQualifiee(referenceRdv(r), r.numero_semaine) || String(r.id).slice(0, 8)),
        total: parBonRdv,
        parTaux: { [cleB]: parBonRdv },
        enLigne: 0,
        comptoir: 0,
        resteAEncaisser: 0,
        bonCadeau: parBonRdv,
        // Le bon a été encaissé le jour de son achat : ce mouvement-ci ne passe
        // par Stripe ni de près ni de loin.
        fraisStripe: 0,
        netStripe: 0,
        statut: r.statut,
      }, {
        id: r.id,
        remboursements: retoursPlafonnes(retours.parRdv.get(r.id), parBonRdv),
      })
    }

    // Seul l'ACOMPTE transite par Yoppaa. Le solde ci-dessus n'y transite pas
    // non plus : c'est le commerçant qui le déclare, et il est marqué comme
    // encaissé au comptoir, jamais en ligne.
    // ⚠️ 🔴 ET C'EST ICI QUE LE JOURNAL MENTAIT LE PLUS FORT (02/09). Cette
    // boucle ne filtre AUCUN statut, et `STATUTS_EXCLUS` n'en contient aucun de
    // rendez-vous : un acompte annulé et remboursé partait chez le comptable
    // avec son montant, ses frais et son net. L'annulation, elle, écrit bien le
    // statut et les colonnes de remboursement, mais laisse `acompte_paye` à
    // vrai et `acompte_montant` intact — et c'est normal, ils disent ce qui a
    // été payé, pas ce qui est resté.
    const acompte = arrondi(r.acompte_montant)
    if (!r.acompte_paye || acompte <= 0) continue
    const cle = cleTaux(r.tva_taux != null ? r.tva_taux : tauxDefaut)
    const acompteEnLigne = r.acompte_paye_en_ligne ? acompte : 0
    const rembAcompte = partRemboursee(r.stripe_refund_amount, acompteEnLigne)
    poser({
      // ⚠️ MÊME CORRECTION QUE CI-DESSUS, et c'est ici qu'elle compte le plus :
      // l'acompte est le seul montant du rendez-vous qui transite réellement
      // par Stripe, donc le seul que le comptable va chercher sur le relevé.
      date: jourComptable(r.acompte_paye_date, r.created_at, r.date_rdv),
      // L acompte est payé en ligne au moment de la réservation.
      heure: heureComptable(r.acompte_paye_date, r.created_at),
      client: nomClientLigne(r.client_prenom, r.client_nom),
      type: 'Acompte RDV',
      canal: 'Rendez-vous',
      regime: 'emporter',
      ...refLigne(referenceQualifiee(referenceRdv(r), r.numero_semaine) || String(r.id).slice(0, 8)),
      total: acompte,
      parTaux: { [cle]: acompte },
      enLigne: acompteEnLigne,
      comptoir: r.acompte_paye_en_ligne ? 0 : acompte,
      // Cette ligne n'existe que si l'acompte est marqué PAYÉ (`acompte_paye`) :
      // il ne reste rien à encaisser dessus non plus.
      resteAEncaisser: 0,
      bonCadeau: 0,
      fraisStripe: montantStripe(acompteEnLigne, r.stripe_frais),
      netStripe: netAvantRemboursement(acompteEnLigne, r.stripe_frais, r.stripe_net, rembAcompte),
      statut: r.statut,
    }, {
      id: r.id,
      remboursements: rembAcompte > 0
        ? [{ montant: rembAcompte, date: r.stripe_refund_date, sur: 'carte' }]
        : [],
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
  //
  // ⚠️ ET AUCUN ABONNEMENT NE SE CONTREPASSE, PARCE QU'AUCUN NE SE REMBOURSE.
  // La table `abonnements` n'a ni `stripe_refund_amount` ni `stripe_refund_id`,
  // et aucune route n'en rembourse un : un contrat résilié cesse de donner des
  // séances, il ne rend pas l'argent. Le jour où le remboursement existera, il
  // faudra les colonnes ET ce traitement, sinon ce journal recommencera à
  // compter de l'argent reparti. On le NOMME plutôt que de le laisser croire
  // couvert par le silence.
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

  // ⚠️ 🔴 LE TRI S'ARRÊTAIT À LA DATE, et le détail sortait en désordre dans la
  // journée : 15:29, 15:30, 15:34, puis 14:55. Alex l'a vu sur son export du
  // 23/08. Un comptable qui recoupe le relevé d'un terminal — horodaté à la
  // minute — remonte les lignes une à une : un ordre approximatif lui fait
  // refaire le travail.
  //
  // ⚠️ L'HEURE PEUT MANQUER (une commande sans date de retrait retombe sur sa
  // création, et une ligne d'abonnement n'en a pas). Les vides passent en
  // dernier dans la journée plutôt que de remonter en tête par hasard.
  return lignes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const ha = a.heure || '99:99'
    const hb = b.heure || '99:99'
    return ha < hb ? -1 : ha > hb ? 1 : 0
  })
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

/**
 * Combien de lignes portent une référence NON QUALIFIÉE, c'est-à-dire sans sa
 * semaine.
 *
 * ⚠️ CES RÉFÉRENCES SE RÉPÈTENT, et Alex l'a vu sur son export du 23/08 : la
 * référence « 1 » y figure DEUX FOIS. Le compteur repart à 1 chaque semaine,
 * et une commande d'avant la numérotation qualifiée n'a ni préfixe ni semaine
 * pour la distinguer : elle sort en entier nu.
 *
 * ⚠️ ET LE COMPTABLE NE PEUT RIEN EN FAIRE : dans l'application, la même
 * commande s'appelle « CC4-2026-S33 ». Chercher « 4 » ne donne rien.
 *
 * On ne réécrit pas ces références — inventer une forme dans un document
 * comptable serait pire. On COMPTE et on le DIT en tête de fichier, comme
 * l'export le fait déjà pour les taux manquants.
 */
export function referencesNonQualifiees(lignes = []) {
  return (lignes || []).filter(l => l && l.referenceIncomplete).length
}

// Combien de lignes sont des remboursements : sert à expliquer les montants
// négatifs en tête de fichier plutôt qu'à laisser un comptable les découvrir.
// ⚠️ 🔴 CE DRAPEAU NE VIVAIT QUE SUR LES COMMANDES (03/09). L'avertissement
// d'en-tête annonçait donc « 9 transactions » sur un export qui en portait 15 :
// les six références de rendez-vous nues, `RV1`, `RV2`, `RV3`, passaient sans
// être signalées. Ce sont pourtant elles qui se répètent le plus, le compteur
// des rendez-vous repartant à 1 chaque semaine comme celui des commandes.
//
// ⚠️ LES ABONNEMENTS EN SONT EXCLUS, ET C'EST VOULU : leur série est CONTINUE,
// donc `ABT7` se suffit à lui-même là où `RV7` a besoin de sa semaine.
function refLigne(brute) {
  return { reference: brute, referenceIncomplete: !/-S\d{2}$/.test(brute || '') }
}

export function compterRemboursements(lignes = []) {
  return (lignes || []).filter(l => l && l.remboursement).length
}

function entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants, refsIncompletes = 0, remboursements = 0 }) {
  const l = [
    ligneCsv([`Export comptable Yoppaa - ${commercant?.nom || ''}`]),
    ligneCsv([`Periode du ${du} au ${au}`]),
    ligneCsv([`Numero d entreprise ${commercant?.bce || ''}`]),
    ligneCsv(['Document d aide a la comptabilite. Yoppaa n est pas un systeme de caisse enregistree certifie (SCE) : ce fichier ne remplace pas une caisse certifiee.']),
    // 🔴 UNE MENTION LEGALE N'EST PAS UNE MENTION DE PERIMETRE (Alex, 31/08).
    //
    // La ligne ci-dessus dit « je ne suis pas certifie ». Elle ne dit PAS « je ne
    // contiens que ce qui est passe par moi ». Un commercant qui lit « Export
    // comptable » et une colonne « CA TTC » peut parfaitement comprendre que ses
    // chiffres sont complets mais non certifies : les deux affirmations n'ont
    // rien a voir.
    //
    // ⚠️ ET LE MANQUE EST REEL, PAS THEORIQUE. `resteAEncaisser` derive de
    // `prix_estime` : quand le commercant ajoute une barbe a une coupe, il
    // encaisse le supplement a SA caisse, et Yoppaa n'en saura jamais rien. La
    // colonne s'appelle « estime » depuis le premier jour ; il manquait de le
    // DIRE au lecteur du fichier.
    //
    // On ne comble pas le trou en laissant saisir un montant libre : un montant
    // sans nature n'a pas de taux, donc pas de ventilation, et demander la
    // nature reviendrait a fabriquer une demi-caisse. On annonce l'etat.
    ligneCsv(['Ce fichier ne contient que les transactions passees par Yoppaa : ce que vous encaissez en dehors de l application n y figure pas.']),
    ligneCsv(['En cas de doute sur un taux applicable, consultez votre comptable ou le SPF Finances.']),
  ]
  if (!assujetti) l.push(ligneCsv(['Commerce non assujetti a la TVA : aucune ventilation n est calculee.']))
  if (avertissementTaux) l.push(ligneCsv(['Certaines transactions anterieures a la mise en place des taux utilisent le taux actuel de l article.']))
  if (tauxManquants) l.push(ligneCsv(['ATTENTION : des articles n ont aucun taux renseigne. Leur montant figure dans la colonne "Taux non renseigne" et n est pas ventile.']))
  // ⚠️ ON COMPTE ET ON NOMME, plutôt que de laisser une référence ambigue
  // passer pour une référence normale.
  if (refsIncompletes > 0) {
    l.push(ligneCsv([`ATTENTION : ${refsIncompletes} transaction${refsIncompletes > 1 ? 's' : ''} anterieure${refsIncompletes > 1 ? 's' : ''} a la numerotation par semaine. Leur reference est un simple numero, qui peut se repeter d une semaine a l autre : distinguez-les par la date.`]))
  }
  // ⚠️ UN MONTANT NEGATIF S EXPLIQUE, SINON IL S INTERPRETE. Le comptable doit
  // savoir que la vente et son remboursement sont DEUX lignes, a DEUX dates,
  // sous la MEME reference, et que le frais preleve par Stripe reste sur la
  // ligne de vente parce qu il n est jamais restitue.
  if (remboursements > 0) {
    l.push(ligneCsv([`${remboursements} remboursement${remboursements > 1 ? 's' : ''} figure${remboursements > 1 ? 'nt' : ''} en negatif, a la date ou l argent est reparti, sous la meme reference que la vente. Stripe ne restituant pas ses frais, le frais retenu reste sur la ligne de vente.`]))
  }
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
  const out = entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants,
    refsIncompletes: referencesNonQualifiees(lignes),
    remboursements: compterRemboursements(lignes) })

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
  const out = entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants,
    refsIncompletes: referencesNonQualifiees(lignes),
    remboursements: compterRemboursements(lignes) })

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
