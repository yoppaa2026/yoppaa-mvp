// BANC : LE RENDEZ-VOUS, SON ARGENT, ET CE QUI REVIENT QUAND IL N'A PAS LIEU.
//
// 🔴 CE BANC RÉPOND À CE QU'ALEX A VU EN PRODUCTION LE 29/08, de bout en bout :
// un bon de 75 €, une coupe à 35 €, deux shampoings à 43,80 €, puis une
// annulation. Quatre défauts d'argent, tous vérifiés dans le code :
//
//   1. LE BON N'ÉTAIT PAS RECRÉDITÉ à l'annulation d'un rendez-vous. Sa fiche
//      affichait encore 40 € au lieu de 75. `/api/rdv/cancel` ne chargeait même
//      pas la colonne.
//   2. LE WEBHOOK `charge.refunded` SORTAIT SUR UN `return` dès qu'il trouvait
//      un rendez-vous, ce qui coupait aussi la branche commande alors que les
//      deux partagent le MÊME paiement.
//   3. L'ÉCRAN DE CONFIRMATION ANNONÇAIT « acompte 8,75 € payé en ligne » sur
//      un rendez-vous où le serveur en encaissait ZÉRO : le même montant était
//      calculé à trois endroits, et l'un des trois avait dérivé.
//   4. LA COMPTABILITÉ NE VOYAIT RIEN d'un rendez-vous payé par bon.
//
// ⚠️ ET UN CINQUIÈME, TROUVÉ EN CHERCHANT LES FRÈRES : l'annulation PAR LE
// COMMERÇANT ne remboursait rien du tout, ni acompte, ni bon, ni récompense.
//
// CE QUI EST MESURÉ ICI : la ventilation est EXÉCUTÉE, cas par cas. Le reste
// est structurel, parce qu'un appel Supabase ne se rejoue pas au banc.
//
//   npm run verif:tunnel-rdv

import { readFileSync } from 'node:fs'
import { ventilerTunnelRdv } from '../lib/tunnel-rdv-montants.js'
import { montantNetRdv, resteAEncaisser } from '../lib/rdv-paiement.js'
import { emailRdvAnnule } from '../lib/resend.js'
import { construireLignes } from '../lib/export-comptable.js'
import { sansProse } from './lire-code.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
const lireCode = (chemin) => sansProse(lire(chemin))

let ok = 0
const echecs = []
function verifie(nom, condition, detail = '') {
  if (condition) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, Math.abs(Number(obtenu) - Number(attendu)) < 0.005, `obtenu ${obtenu}, attendu ${attendu}`)

// ═══ 1) LA VENTILATION, EXÉCUTÉE ══════════════════════════════════════════
{
  // LE CAS D'ALEX, à l'identique. Bon de 75 €, coupe 35 € à 25 % d'acompte,
  // 43,80 € de produits.
  const v = ventilerTunnelRdv({
    prixPrestation: 35, acomptePourcent: 25, acompteEnLigne: true,
    totalProduits: 43.80, remiseRecompense: 0, soldeBon: 75,
  })
  egal('le bon paie la prestation en entier', v.bonSurPresta, 35)
  // 🔴 LA CORRECTION DU 29/08 : les 40 € restants payaient AUTREFOIS zéro.
  egal('et le reste part sur les produits', v.bonSurProduits, 40)
  egal('le bon est donc consommé de 75 €', v.bonTotal, 75)
  egal('la prestation ne coûte plus rien', v.prestaNette, 0)
  // ⚠️ C'EST ICI QUE NAISSAIT LE « 8,75 € ✓ payé en ligne » : l'acompte se
  // calcule sur la prestation NETTE, donc sur zéro.
  egal('l’acompte tombe à zéro', v.acompte, 0)
  egal('il reste 3,80 € de produits à payer', v.produitsAPayer, 3.80)
  egal('et c’est tout ce que Stripe encaisse', v.aPayerMaintenant, 3.80)
  egal('rien à régler au comptoir', v.soldeSurPlace, 0)
}
{
  // Sans bon ni récompense : l'acompte est bien 25 % de 35 €.
  const v = ventilerTunnelRdv({
    prixPrestation: 35, acomptePourcent: 25, acompteEnLigne: true, totalProduits: 43.80,
  })
  egal('sans avantage, l’acompte vaut 8,75 €', v.acompte, 8.75)
  egal('et le paiement vaut acompte + produits', v.aPayerMaintenant, 52.55)
  egal('le solde au comptoir est le reste de la prestation', v.soldeSurPlace, 26.25)
}
{
  // ⚠️ F22, LA RÈGLE D'ALEX DU 24/08 : l'acompte se calcule sur le NET de
  // récompense. 30 € à 25 % font 7,50 ; avec 5 € de récompense, 6,25.
  const v = ventilerTunnelRdv({
    prixPrestation: 30, acomptePourcent: 25, acompteEnLigne: true, remiseRecompense: 5,
  })
  egal('F22 : l’acompte suit la récompense', v.acompte, 6.25)
  egal('la récompense ne mord que sur la prestation', v.prestaNette, 25)
}
{
  // ⚠️ L'ORDRE : récompense d'abord, bon ensuite. Dans l'autre sens, le
  // porteur du bon brûlerait du solde sur une part déjà offerte.
  const v = ventilerTunnelRdv({
    prixPrestation: 40, acomptePourcent: 25, acompteEnLigne: true,
    remiseRecompense: 10, soldeBon: 100, totalProduits: 0,
  })
  egal('la récompense passe en premier', v.remiseRecompense, 10)
  egal('le bon ne paie que ce qui reste', v.bonSurPresta, 30)
  verifie('le bon n’a pas mangé la part offerte', v.bonTotal === 30)
}
{
  // 🔴 LA RÉCOMPENSE PAIE LES PRODUITS AUSSI (rectifié le 30/08).
  //
  // Je l'avais d'abord réservée à la prestation. Alex a demandé ce qui se
  // passe quand on n'achète QUE des produits : `create-commande` applique
  // déjà la récompense sur le total, frais de livraison compris. La même
  // récompense payait donc le pain chez le boulanger et refusait le shampoing
  // chez le coiffeur, au seul motif qu'un rendez-vous l'accompagnait.
  const v = ventilerTunnelRdv({
    prixPrestation: 20, acomptePourcent: 0, acompteEnLigne: false,
    totalProduits: 50, remiseRecompense: 40,
  })
  egal('la récompense couvre la prestation', v.recompenseSurPresta, 20)
  egal('et déborde sur les produits', v.recompenseSurProduits, 20)
  egal('elle est consommée en entier', v.remiseRecompense, 40)
  egal('il ne reste que 30 € de produits', v.produitsAPayer, 30)
  // ⚠️ MAIS JAMAIS AU-DELÀ DU PANIER : une récompense de 100 € sur un panier
  // de 70 € n'en déduit que 70.
  const trop = ventilerTunnelRdv({
    prixPrestation: 20, acomptePourcent: 0, acompteEnLigne: false,
    totalProduits: 50, remiseRecompense: 100,
  })
  egal('la récompense est plafonnée au panier', trop.remiseRecompense, 70)
  egal('et rien ne devient négatif', trop.produitsAPayer, 0)
}
{
  // ⚠️ L'ORDRE ENTRE LES DEUX AVANTAGES ET LES DEUX POSTES, tout ensemble.
  // Récompense d'abord, bon ensuite ; prestation d'abord, produits ensuite.
  const v = ventilerTunnelRdv({
    prixPrestation: 60, acomptePourcent: 50, acompteEnLigne: true,
    totalProduits: 21.90, remiseRecompense: 10, soldeBon: 100,
  })
  egal('la récompense reste sur la prestation tant qu’elle y tient', v.recompenseSurPresta, 10)
  egal('elle ne touche donc pas les produits', v.recompenseSurProduits, 0)
  egal('le bon prend le reste de la prestation', v.bonSurPresta, 50)
  egal('puis les produits en entier', v.bonSurProduits, 21.90)
  egal('plus rien à payer', v.aPayerMaintenant, 0)
  egal('ni au comptoir', v.soldeSurPlace, 0)
}
{
  // ⚠️ LA PART PRODUITS DE LA RÉCOMPENSE S'ÉCRIT SUR LA COMMANDE, la part
  // prestation sur le rendez-vous. Sans ce partage, `resteAEncaisser` et le
  // journal comptable réclameraient une remise déjà accordée.
  const src = lireCode('app/api/stripe/checkout/create-rdv-commande/route.js')
  verifie('la part produits de la récompense vit sur la commande',
    /fidelite_remise: vent\.recompenseSurProduits/.test(src))
  verifie('la part prestation part vers le rendez-vous',
    /fidelite_remise: String\(vent\.recompenseSurPresta\)/.test(src))
  // ⚠️ ET UN SEUL PORTEUR DE LA RÉCOMPENSE : elle est consommée une fois, et
  // c'est le RENDEZ-VOUS qui la porte. La poser aussi sur la commande ferait
  // croire à deux consommations.
  //
  // ⚠️ ON ISOLE L'INSERT DE LA COMMANDE. La garde cherchait le mot dans TOUT le
  // fichier, et elle a rougi le 30/08 sur du code juste : le rendez-vous créé
  // sans paiement porte légitimement `fidelite_recompense_id`. Chercher un mot
  // dans un fichier qui parle de ce mot ailleurs ne mesure rien.
  const insertCommande = (() => {
    const i = src.indexOf('.from(\'commandes\')\n      .insert({')
    return i < 0 ? '' : src.slice(i, src.indexOf('\n      })', i))
  })()
  verifie('l’insert de la commande est bien trouvé', insertCommande.length > 200,
    `${insertCommande.length} caractères`)
  verifie('la commande ne porte pas l’identifiant de la récompense',
    !/fidelite_recompense_id/.test(insertCommande))
  // ⚠️ L'ASSIETTE EST LE PANIER, calculée après la lecture des produits.
  verifie('l’assiette de la récompense est le panier entier',
    /assietteRecompense = arrondiEuros\(\(prixBase \|\| 0\) \+ produitsCents/.test(src))
  // ⚠️ LA LIGNE STRIPE UNIQUE COUVRE LES DEUX AVANTAGES : ne tester que le bon
  // laisserait passer des lignes au prix plein sur un total déjà réduit.
  verifie('la ligne Stripe unique tient compte des deux avantages',
    /vent\.bonSurProduits \+ vent\.recompenseSurProduits/.test(src))
}
{
  // ⚠️ ET À L'ANNULATION : une récompense qui a payé des produits GARDÉS ne
  // revient pas. ⚠️ On décide AVANT d'agir : la rendre puis la reprendre
  // laisserait `recompenses_disponibles` au-dessus du nombre de lignes.
  const src = lireCode('app/api/rdv/cancel/route.js')
  // ⚠️ ON MESURE LA DÉFINITION, pas le nom : `= false` laissait le nom en
  // place et la garde verte. Quatrième fois en deux jours.
  const defGardes = (src.match(/const recompenseSurProduitsGardes = [^\n]*(\n[^\n]*)?/) || [''])[0]
  verifie('la récompense ne revient pas si elle a payé des produits gardés',
    /gardeSesProduits/.test(defGardes) && /fidelite_remise/.test(defGardes), defGardes)
  // ⚠️ ET LE CHOIX SE FAIT AVANT L'APPEL, pas après : rendre puis reprendre
  // laisserait `recompenses_disponibles` au-dessus du nombre de lignes.
  verifie('la décision passe dans l’appel qui rend',
    /recompenseId: recompenseSurProduitsGardes \? null :/.test(src))
  verifie('et on ne la rend pas pour la reprendre ensuite',
    !/utilisee_at: new Date\(\)/.test(src))
}
{
  // ⚠️ LE PIÈGE DU ZÉRO, sixième fois sur ce projet : une prestation SUR DEVIS
  // n'a pas de prix, et « on ne sait pas » n'est pas « gratuit ».
  const v = ventilerTunnelRdv({ prixPrestation: null, acomptePourcent: 25, acompteEnLigne: true, totalProduits: 10 })
  verifie('prix inconnu : la prestation nette est null', v.prestaNette === null)
  verifie('prix inconnu : le solde sur place est null, pas zéro', v.soldeSurPlace === null)
  egal('prix inconnu : aucun acompte inventé', v.acompte, 0)
  egal('mais les produits restent encaissables', v.aPayerMaintenant, 10)
}
{
  // Acompte non activé chez le commerçant : il ne s'invente pas.
  const v = ventilerTunnelRdv({ prixPrestation: 60, acomptePourcent: 30, acompteEnLigne: false, totalProduits: 0 })
  egal('acompte désactivé : rien à payer en ligne', v.aPayerMaintenant, 0)
  egal('tout se règle au comptoir', v.soldeSurPlace, 60)
}
{
  // Un bon plus petit que la prestation ne déborde pas sur les produits.
  const v = ventilerTunnelRdv({
    prixPrestation: 35, acomptePourcent: 25, acompteEnLigne: true, totalProduits: 20, soldeBon: 10,
  })
  egal('le bon reste sur la prestation', v.bonSurPresta, 10)
  egal('et ne touche pas aux produits', v.bonSurProduits, 0)
  // 🔴 CE CONTRÔLE ATTENDAIT 6,25 € JUSQU'AU 30/08 AU SOIR : l'acompte se
  // calculait sur la prestation NETTE de bon. La règle a changé, et ce n'est
  // pas un raffinement, c'est un renversement.
  egal('l’acompte dû se calcule sur la prestation', v.acompteDu, 8.75)
  egal('et les 10 € du bon l’effacent', v.acompte, 0)
  egal('le comptoir encaisse le reste de la prestation', v.soldeSurPlace, 25)
  egal('Stripe n’encaisse plus que les produits', v.aPayerMaintenant, 20)
}
{
  // 🔴 LE CAS EXACT D'ALEX, CAPTURE DU 30/08 AU SOIR. Head Spa 60 € à 50 %
  // d'acompte, récompense de 10 €, bon de 40 €, un shampoing à 21,90 €.
  //
  // AVANT : l'acompte se calculait sur la prestation nette, soit 50 % de 10 €,
  // et on réclamait 5 € de plus à quelqu'un qui venait d'engager 40 € de bon.
  // « Le client se dit : j'ai déjà payé bien plus que l'acompte. »
  //
  // ⚠️ LA RÉCOMPENSE BAISSE LE PRIX, LE BON PAIE LE PRIX. L'assiette vaut donc
  // 50 € (le prix moins la récompense), l'acompte dû 25 €, et le bon de 40 € le
  // couvre déjà largement. Un acompte est une GARANTIE, et le bon en est une
  // plus grosse : il ne revient qu'à l'annulation, jamais sur un no-show. La
  // demander deux fois, c'est la demander deux fois.
  const v = ventilerTunnelRdv({
    prixPrestation: 60, acomptePourcent: 50, acompteEnLigne: true,
    totalProduits: 21.90, remiseRecompense: 10, soldeBon: 40,
  })
  egal('la récompense reste sur la prestation', v.recompenseSurPresta, 10)
  egal('le bon paie 40 € de prestation', v.bonSurPresta, 40)
  egal('l’acompte dû valait 25 €', v.acompteDu, 25)
  egal('le bon l’a déjà couvert : plus rien à avancer', v.acompte, 0)
  egal('les 10 € restants se règlent au comptoir', v.soldeSurPlace, 10)
  egal('et Stripe n’encaisse que les produits', v.aPayerMaintenant, 21.90)
}
{
  // ⚠️ UN BON PLUS PETIT QUE L'ACOMPTE NE LE SUPPRIME PAS, IL LE RÉDUIT. La
  // garantie du commerçant reste entière, elle change seulement de support.
  const v = ventilerTunnelRdv({
    prixPrestation: 60, acomptePourcent: 50, acompteEnLigne: true, soldeBon: 20,
  })
  egal('l’acompte dû vaut 30 €', v.acompteDu, 30)
  egal('le bon en retranche 20 €', v.acompte, 10)
  egal('bon et acompte réunis font la garantie entière', v.bonSurPresta + v.acompte, 30)
  egal('et le comptoir encaisse le reste', v.soldeSurPlace, 30)
}
{
  // ⚠️ ET L'ACOMPTE NE DÉPASSE JAMAIS CE QUI RESTE À PAYER. Un réglage à 120 %
  // ferait avancer au Yopper plus que le prix de sa prestation.
  const v = ventilerTunnelRdv({ prixPrestation: 40, acomptePourcent: 120, acompteEnLigne: true })
  egal('l’acompte est plafonné à la prestation nette', v.acompte, 40)
  egal('et le comptoir n’a plus rien à prendre', v.soldeSurPlace, 0)
}

// ═══ 2) CE QUE LE CLIENT LIT SUR SON SUIVI ════════════════════════════════
{
  // 🔴 LE TARIF PLEIN S'AFFICHAIT SUR UN RENDEZ-VOUS DÉJÀ PAYÉ.
  egal('le net client retranche le bon', montantNetRdv({ prix_estime: 35, bon_cadeau_montant: 35 }), 0)
  egal('et la récompense', montantNetRdv({ prix_estime: 40, fidelite_remise: 10 }), 30)
  egal('et les deux ensemble', montantNetRdv({ prix_estime: 40, fidelite_remise: 10, bon_cadeau_montant: 25 }), 5)
  egal('sans avantage, c’est le prix', montantNetRdv({ prix_estime: 35 }), 35)
  // ⚠️ « ON NE SAIT PAS » N'EST PAS « GRATUIT ».
  verifie('prix absent : null, jamais 0', montantNetRdv({ prix_estime: null }) === null)
  verifie('rendez-vous vide : null', montantNetRdv({}) === null)
  // ⚠️ ET LE PIÈGE DU ZÉRO : `Number(null)` vaut 0 et EST fini.
  egal('une remise nulle ne casse rien', montantNetRdv({ prix_estime: 20, fidelite_remise: null }), 20)
}
{
  // La sœur commerçant existait déjà et ne doit pas changer de sens.
  egal('le reste au comptoir retranche aussi le bon',
    resteAEncaisser({ prix_estime: 35, bon_cadeau_montant: 35 }), 0)
}

// ═══ 3) L'ARGENT QUI REVIENT, DANS LES DEUX ROUTES D'ANNULATION ═══════════
for (const [nom, chemin] of [
  ['annulation par le client', 'app/api/rdv/cancel/route.js'],
  ['annulation par le commerçant', 'app/api/rdv/annuler-commercant/route.js'],
]) {
  const src = lireCode(chemin)
  // 🔴 LA COLONNE DOIT ARRIVER JUSQU'À LA ROUTE. Absente du select, elle vaut
  // `undefined`, `Number(undefined)` n'est pas fini, et le bon n'est jamais
  // rendu EN SILENCE.
  //
  // ⚠️ ON REGARDE DANS LE `select`, PAS DANS LE FICHIER. Ma première version
  // cherchait `bon_cadeau_id` n'importe où : le nom apparaît aussi dans le
  // re-crédit, donc retirer la colonne du select laissait la garde VERTE. Le
  // harnais de mutation l'a dit, et c'est la troisième fois cette semaine que
  // je copie un MOT au lieu de mesurer une RÈGLE.
  //
  // ⚠️ ET ON VISE LE BON SELECT : celui du RENDEZ-VOUS, reconnu à
  // `acompte_montant`, jamais celui de la commande liée qui porte les mêmes
  // noms de colonnes.
  // ⚠️ Les deux routes n'écrivent pas leur select de la même façon : l'une le
  // pose dans une constante, l'autre en ligne. On prend donc TOUS les blocs
  // entre accents graves, et on garde celui du rendez-vous.
  const selectRdv = [...src.matchAll(/`([^`]*)`/g)]
    .map(m => m[1]).find(s => /acompte_montant/.test(s) && /statut/.test(s)) || ''
  verifie(`${nom} : le select du rendez-vous charge bon_cadeau_id`,
    /bon_cadeau_id/.test(selectRdv))
  verifie(`${nom} : et bon_cadeau_montant`, /bon_cadeau_montant/.test(selectRdv))
  // 🔴 CE QUI RESTE À RENDRE, PAS « RIEN SI UN IDENTIFIANT EXISTE » (Annul-I7,
  // 04/10). Un geste partiel fait depuis Stripe posait `stripe_refund_id` : le
  // studio qui annulait ensuite ne rendait plus le reste. La règle s'exécute au
  // banc plus bas ; ici, chaque route la suit, avec le cumul déjà parti.
  verifie(`${nom} : le select du rendez-vous charge stripe_refund_amount`,
    /stripe_refund_amount/.test(selectRdv))
  verifie(`${nom} : rembourse ce qui reste, plus seulement « s’il n’y a rien eu »`,
    /const reste = resteARembourser\(aRembourser, rdv\)/.test(src)
    && /if \(aDejaPaye && reste > 0\)/.test(src) && !/!rdv\.stripe_refund_id/.test(src))
  verifie(`${nom} : annonce ce geste, et écrit le cumul`,
    /refundMontant = reste\n/.test(src)
    && /stripe_refund_amount = arr\(dejaRembourse \+ refundMontant\)/.test(src))
  // 🔴 CES TROIS GARDES CHERCHAIENT `recrediterBon(`, `rec?.ok` et
  // `rendreRecompense(` DANS LA ROUTE, jusqu'au 30/08 au soir. Elles ont rougi
  // sur du code juste le jour où le geste a déménagé dans un module, et elles
  // seraient restées vertes sur DEUX versions divergentes du même geste : c'est
  // exactement ce qui a produit le défaut qu'elles étaient censées garder.
  //
  // ⚠️ ON MESURE LA DÉLÉGATION, et le CONTENU s'exécute plus bas, section 9.
  // 🔴 TOUS LES BONS DU RENDEZ-VOUS, ET PLUS UN SEUL (01/09). Passer la paire
  // `bon_cadeau_id` / `bon_cadeau_montant` remettrait le TOTAL sur le PREMIER
  // bon : de l'argent créé sur celui-là, détruit sur les autres.
  //
  // ⚠️ LA VIRGULE FINALE FAIT LA MOITIÉ DE LA GARDE. Sans elle, un
  // `lignesBonsDe(rdv).slice(0, 1)` la laissait VERTE : la mutation « ne rend
  // que le premier bon » passait sans être vue.
  verifie(`${nom} : passe TOUS les bons du rendez-vous au module`,
    /bonsUtilises: lignesBonsDe\(rdv\),\n/.test(src))
  verifie(`${nom} : et sa récompense`, /recompenseId: [^\n]*rdv\.fidelite_recompense_id/.test(src))
  verifie(`${nom} : avec le montant qu'elle valait`,
    /recompenseMontant: [\s\S]{0,120}fidelite_remise/.test(src))
  // ⚠️ ET LA COMMANDE LIÉE PORTE SES PROPRES AVANTAGES depuis que le bon paie
  // les produits : les oublier laisserait la moitié du bon dans le vide.
  verifie(`${nom} : traite les avantages de la commande liée`,
    /bonsUtilises: lignesBonsDe\(commandeLiee\),\n/.test(src))
  // ⚠️ ET LA COLONNE EST DEMANDÉE DANS LES DEUX SELECT. Une colonne absente
  // d'un select est LE défaut le plus fréquent de ce projet, et il est
  // SILENCIEUX : la liste arriverait vide et pas un centime ne serait rendu.
  verifie(`${nom} : charge bons_utilises pour le rendez-vous ET la commande`,
    (src.match(/bons_utilises/g) || []).length >= 2,
    `${(src.match(/bons_utilises/g) || []).length} occurrences`)
  // 🔴 ET LE REMBOURSEMENT NE PORTE QUE SUR LA PART CARTE. Rembourser le brut
  // reviendrait à rendre au client un argent qu'il n'a jamais sorti.
  //
  // ⚠️ ON MESURE LA DÉFINITION DE `produitsPayesCarte`, pas la présence du nom
  // quelque part dans le fichier : la soustraction existe AUSSI dans le bloc
  // qui répond au client, si bien que la vider ici laissait la garde verte.
  const defCarte = (src.match(/const produitsPayesCarte = [\s\S]*?\n\s*: 0\n/) || [''])[0]
  verifie(`${nom} : la part carte retranche le bon`,
    /bon_cadeau_montant/.test(defCarte), 'définition de produitsPayesCarte')
  verifie(`${nom} : la part carte retranche la récompense`,
    /fidelite_remise/.test(defCarte), 'définition de produitsPayesCarte')
}
{
  const src = lireCode('app/api/rdv/cancel/route.js')
  // ⚠️ LE CLIENT QUI GARDE SES PRODUITS NE RÉCUPÈRE PAS LEUR PART DE BON.
  verifie('les produits gardés ne rendent pas leur bon', /!gardeSesProduits/.test(src))
  // 🔴 ET LE MONTANT DE CE REMBOURSEMENT PARTIEL EST CE QUI RESTE (Annul-I7,
  // 04/10). Le harnais l'a dit : rembourser `aRembourser` après un geste déjà
  // fait depuis Stripe rendait ce geste une seconde fois, et la garde de la
  // boucle ne regarde pas cette ligne-là.
  verifie('le client qui garde ses produits ne se fait rendre que ce qui reste',
    /\.\.\.\(gardeSesProduits \? \{ amount: Math\.round\(reste \* 100\) \} : \{\}\),/.test(src))
  // Et le message le dit : sans ça, il lit « 43,80 € reviennent » et croit
  // avoir perdu son bon.
  verifie('le message annonce le bon recrédité', /phraseBon/.test(src))
  verifie('le message est au format belge', !/eurosNus\(refundMontant\)\}€/.test(src))
}
{
  const src = lireCode('app/dashboard/page.js')
  // 🔴 L'ANNULATION COMMERÇANT PASSE PAR LE SERVEUR. Elle écrivait le statut
  // depuis le navigateur et ne remboursait rien : le Yopper perdait acompte,
  // bon et récompense sur une annulation qu'il ne demandait pas.
  verifie('le tableau de bord appelle la route d’annulation',
    /postPro\('\/api\/rdv\/annuler-commercant'/.test(src))
  verifie('et ne fait plus l’update de statut en direct',
    !/update\(\{ statut: 'annule_commercant' \}\)/.test(src))
  verifie('l’email d’annulation porte les montants rendus',
    /bon_rendu: j\.bon_rendu/.test(src))
  // 🔴 ANNUL-I2 (04/10) : « Remettre en confirmé » s'écrivait d'ici, par-dessus
  // un acompte remboursé et des bons rendus. Il passe par le serveur.
  verifie('🔴 « Remettre en confirmé » passe par le serveur',
    /if \(statut === 'confirme'\) \{\s*const res = await postPro\('\/api\/rdv\/reconfirmer', \{ rdv_id: rdvId \}\)/.test(src))
  verifie('et l’écran dit pourquoi le serveur refuse',
    /alert\(j\?\.error \|\| 'Le rendez-vous n’a pas pu être remis en confirmé/.test(src))
}

// ═══ ANNUL-I2 (04/10) : UN RENDEZ-VOUS ANNULÉ NE REVIENT PAS GRATUIT ═══════
{
  const { refusRemiseEnConfirme } = await import('../lib/rdv-reconfirmation.js')
  const { euros } = await import('../lib/montants.js')
  const code = (etat) => refusRemiseEnConfirme(etat)?.code ?? null
  verifie('rien n’a bougé : il revient', code({ statut: 'annule_commercant' }) === null)
  verifie('une absence notée par erreur aussi', code({ statut: 'no_show' }) === null)
  verifie('🔴 un acompte remboursé le bloque', code({ statut: 'annule_commercant', rembourse: 20 }) === 'rembourse')
  verifie('🔴 un bon rendu aussi', code({ statut: 'annule_commercant', bonsRendus: 35 }) === 'bon_rendu')
  verifie('🔴 une récompense rendue aussi', code({ statut: 'no_show', recompenseRendue: true }) === 'recompense_rendue')
  verifie('🔴 des produits annulés aussi', code({ statut: 'annule_commercant', produitsAnnules: true }) === 'produits_annules')
  verifie('🔴 une absence facturée aussi', code({ statut: 'no_show', absenceFacturee: true }) === 'absence_facturee')
  verifie('un abonnement résilié aussi', code({ statut: 'annule_commercant', abonnementResilie: true }) === 'abonnement_resilie')
  verifie('un cours annulé pour tous aussi', code({ statut: 'annule_commercant', fermeture: 'seance' }) === 'seance_fermee')
  verifie('un jour fermé aussi', code({ statut: 'annule_commercant', fermeture: 'jour' }) === 'jour_ferme')
  verifie('🔴 l’annulation du client ne se défait pas d’ici', code({ statut: 'annule_client' }) === 'statut')
  verifie('ni un rendez-vous honoré', code({ statut: 'honore' }) === 'statut')
  verifie('le refus dit le montant, à la belge',
    (refusRemiseEnConfirme({ statut: 'annule_commercant', rembourse: 20 })?.message || '').includes(euros(20)))
  verifie('et propose le geste qui marche',
    /nouveau rendez-vous/.test(refusRemiseEnConfirme({ statut: 'annule_commercant', bonsRendus: 5 })?.message || ''))

  const src = lireCode('app/api/rdv/reconfirmer/route.js')
  verifie('🔴 la route est gardée comme l’annulation',
    /gardeLigneEquipe\(request, supabase, 'rdv_reservations', rdv_id, 'agenda'\)/.test(src) && /refus\(verdict, NextResponse\)/.test(src))
  const selectR = (src.match(/\.select\(`([^`]*)`\)/) || ['', ''])[1]
  for (const col of ['stripe_refund_amount', 'commande_id', 'abonnement_id', 'fidelite_recompense_id', 'empreinte_debit_at', 'prestation_id', 'praticien_id']) {
    verifie(`🔴 le select charge ${col}`, new RegExp(`\\b${col}\\b`).test(selectR))
  }
  verifie('🔴 elle relit les bons rendus au rendez-vous',
    /from\('bons_cadeaux_mouvements'\)\.select\('montant'\)\.eq\('rdv_id', rdv\.id\)\.eq\('source', 'annulation'\)/.test(src))
  verifie('🔴 une lecture ratée refuse, elle ne laisse pas passer',
    /const echec = lectures\.find\(l => l\?\.error\)\s*if \(echec\) \{[\s\S]{0,360}status: 500/.test(src))
  verifie('🔴 la règle commune décide',
    /const refusMotif = refusRemiseEnConfirme\(\{/.test(src) && /if \(refusMotif\) return NextResponse\.json\(/.test(src))
  verifie('la récompense rendue se lit à `utilisee_at` vide',
    /recompenseRendue: !!rdv\.fidelite_recompense_id && !!recompense && !recompense\.utilisee_at/.test(src))
  verifie('🔴 un seul gagnant si deux écrans cliquent', /\.eq\('id', rdv\.id\)\.eq\('statut', rdv\.statut\)/.test(src))
  verifie('🔴 une place reprise se dit en français',
    /errU\.code === '23505' \|\| errU\.code === '23P01'/.test(src))
  verifie('le rappel de la veille est reprogrammé', /programmerRappelRdv\(rdv\.id, supabase\)/.test(src))
  verifie('🔴 la personne est prévenue par email', /emailRdvRetabli\(\{/.test(src) && /envoyerAuYopper\(\{/.test(src))

  const { emailRdvRetabli } = await import('../lib/resend.js')
  const avenir = emailRdvRetabli({ yopper_prenom: '<b>Sophie</b>', commercant_nom: 'Centre Respire', prestation_nom: 'Hatha', date_rdv: '2026-10-08', heure_debut: '18:30:00' })
  verifie('l’email dit « maintenu » et l’heure', /maintenu/.test(avenir) && /18:30/.test(avenir))
  verifie('🔴 et il échappe le prénom', !/<b>Sophie<\/b>/.test(avenir) && /&lt;b&gt;Sophie/.test(avenir))
  const passe = emailRdvRetabli({ commercant_nom: 'Centre Respire', date_rdv: '2026-10-01', heure_debut: '09:00', passe: true })
  verifie('une absence corrigée retire le reproche, sans « on t’attend »', /erreur/.test(passe) && !/on t’attend/.test(passe))

  const { confirmationRdv } = await import('../lib/confirmation-rdv.js')
  verifie('🔴 le commerce apprend si l’email n’est pas parti',
    /préviens cette personne toi-même/.test(confirmationRdv('confirme', { rdv: { client_prenom: 'Sophie' }, retours: { email: 'echec' } })))
}
{
  const src = lireCode('app/api/rdv/annuler-commercant/route.js')
  // ⚠️ SÉCURITÉ : cette route rembourse et recrédite. Sans garde, n'importe
  // qui annulerait les rendez-vous de n'importe quel commerçant.
  // ⚠️ RÉORIENTÉE LE 29/09 (équipe) : le patron, l'admin, et un membre avec « Agenda ».
  verifie('la route d’annulation commerçant est gardée', /gardeLigneEquipe\(request, supabase, 'rdv_reservations', rdv_id, 'agenda'\)/.test(src))
  verifie('et le refus est rendu, pas ignoré', /refus\(verdict, NextResponse\)/.test(src))
  // ⚠️ IDEMPOTENCE : un rejeu ne rembourse pas deux fois.
  verifie('un rendez-vous déjà annulé ne rembourse pas une seconde fois',
    /already_canceled/.test(src))
  // ⚠️ RÉORIENTÉE LE 04/10 (Annul-I7) : « déjà fait » se lit au MONTANT déjà
  // rendu, plus à la seule présence d'un identifiant (gardes de la boucle
  // ci-dessus, règle exécutée au banc `resteARembourser`).
  verifie('et un remboursement déjà fait non plus',
    /resteARembourser\(aRembourser, rdv\)/.test(src) && /stripe_refund_id, stripe_refund_amount/.test(src))
}

// ═══ 4) LE WEBHOOK NE COUPE PLUS LA BRANCHE COMMANDE ══════════════════════
{
  const src = lireCode('app/api/stripe/webhook/route.js')
  const bloc = src.slice(src.indexOf('async function handleChargeRefunded'))
  const finBloc = bloc.slice(0, bloc.indexOf('\n}\n'))
  // 🔴 LE `return` APRÈS LE RENDEZ-VOUS. Dans le tunnel unique, le rendez-vous
  // et la commande partagent le MÊME `payment_intent` : sortir sur le premier
  // privait la seconde de son remboursement, de son statut et de son bon.
  verifie('le webhook ne sort plus après avoir trouvé le rendez-vous',
    !/console\.info\('\[stripe\/webhook\] refund enregistré sur RDV'[^)]*\)\s*\n\s*return/.test(finBloc))
  // ⚠️ CETTE GARDE VISAIT `recrediterBon(supabase, rdv.bon_cadeau_id`, donc la
  // FORME d'un recrédit unitaire. Le 01/09 le rendez-vous peut porter
  // PLUSIEURS bons, et c'est `rdv.bons_utilises` qui fait foi : la garde a
  // rougi alors que la promesse — le webhook rend bien le bon du rendez-vous —
  // n'avait pas bougé. Ce qui ne doit pas changer, c'est qu'un recrédit parte
  // d'ici avec la référence du rendez-vous.
  verifie('il recrédite les bons du rendez-vous',
    /recrediterBons\(supabase, rdv\.bons_utilises, \{ rdv_id: rdv\.id \}\)/.test(finBloc))
  // 🔴 ET IL LIT LA LISTE, PAS L'IDENTIFIANT UNIQUE : sur trois bons, lire
  // `bon_cadeau_id` n'en rendrait qu'un et les deux autres seraient perdus.
  verifie('🔴 et il part de la LISTE, jamais du seul bon_cadeau_id',
    /rdv\.bons_utilises/.test(finBloc) && !/recrediterBons?\(supabase, rdv\.bon_cadeau_id/.test(finBloc))
  verifie('il rend la récompense du rendez-vous',
    /rdv\.fidelite_recompense_id/.test(finBloc))
  verifie('et il traite toujours la commande', /from\('commandes'\)/.test(finBloc))

  // 🔴 ANNUL-I7 (04/10) : LE WEBHOOK RENDAIT TOUT SUR UN REMBOURSEMENT PARTIEL.
  // L'absent dont la route garde le bon de garantie le récupérait entier ici,
  // et un geste de 5 € rendait 40 € de bon. Et il lisait `charge.refunds`, une
  // liste que Stripe n'inclut plus par défaut depuis l'API 2022-11-15.
  verifie('🔴 le webhook lit le cumul et « tout rendu » par la règle commune',
    /lireRemboursementCharge\(charge\)/.test(finBloc) && !/charge\.refunds\?\.data/.test(finBloc))
  verifie('🔴 il ne rend les bons qu’avec la permission de la règle',
    /if \(rendreAvantages && Array\.isArray\(rdv\.bons_utilises\)/.test(finBloc))
  verifie('🔴 ni la récompense',
    /if \(rendreAvantages && rdv\.fidelite_recompense_id\)/.test(finBloc))
  verifie('🔴 la permission lit le statut du rendez-vous, chargé',
    /webhookRendLesAvantagesRdv\(\{ total, statut: rdv\.statut \}\)/.test(finBloc)
    && /\.select\('id, statut, bon_cadeau_id/.test(finBloc))
  verifie('🔴 la commande juge « total » sur le cumul, plus sur le dernier remboursement',
    /const isRefundTotal = total\n/.test(finBloc) && !/refund\.amount/.test(finBloc))
  verifie('il reçoit le compte du commerce pour relire l’identifiant',
    /handleChargeRefunded\(event\.data\.object, supabase, event\.account\)/.test(src))
}

// ═══ 4 bis) LA RÈGLE DU REMBOURSEMENT, EXÉCUTÉE (Annul-I7, 04/10) ═════════
{
  const { resteARembourser, lireRemboursementCharge, webhookRendLesAvantagesRdv } =
    await import('../lib/remboursements.js')
  egal('rien de rendu : tout reste dû', resteARembourser(30, { stripe_refund_id: null, stripe_refund_amount: null }), 30)
  egal('🔴 un geste de 10 € depuis Stripe : 20 € restent', resteARembourser(30, { stripe_refund_id: 're_1', stripe_refund_amount: 10 }), 20)
  egal('tout rendu : plus rien', resteARembourser(30, { stripe_refund_id: 're_1', stripe_refund_amount: 30 }), 0)
  egal('plus que dû (paiement partagé avec des produits) : plus rien', resteARembourser(30, { stripe_refund_id: 're_1', stripe_refund_amount: 45 }), 0)
  egal('🔴 un identifiant sans montant : prudence, rien', resteARembourser(30, { stripe_refund_id: 're_1', stripe_refund_amount: null }), 0)
  egal('ni identifiant ni montant : tout reste dû', resteARembourser(30, {}), 30)
  egal('un montant lu comme texte', resteARembourser(30, { stripe_refund_id: 're_1', stripe_refund_amount: '12.5' }), 17.5)
  egal('rien à rendre : zéro', resteARembourser(0, {}), 0)

  const partiel = lireRemboursementCharge({ amount_refunded: 1000, refunded: false })
  egal('🔴 sans liste dans l’événement, le cumul se lit quand même', partiel.montant, 10)
  verifie('un partiel n’est pas total', partiel.total === false)
  verifie('et l’identifiant manque, sans planter', partiel.refundId === null)
  const complet = lireRemboursementCharge({ amount_refunded: 3000, refunded: true, refunds: { data: [{ id: 're_9', amount: 2000 }] } })
  egal('🔴 le montant est le CUMUL, pas le dernier remboursement', complet.montant, 30)
  verifie('« refunded » dit tout rendu', complet.total === true)
  verifie('l’identifiant vient de la liste quand elle est là', complet.refundId === 're_9', String(complet.refundId))
  egal('rien de rendu : zéro', lireRemboursementCharge({ amount_refunded: 0, refunded: false }).montant, 0)

  verifie('annulé et tout rendu : le secours rend les avantages', webhookRendLesAvantagesRdv({ total: true, statut: 'annule_commercant' }) === true)
  verifie('annulé par le client aussi', webhookRendLesAvantagesRdv({ total: true, statut: 'annule_client' }) === true)
  verifie('🔴 un geste partiel ne rend rien', webhookRendLesAvantagesRdv({ total: false, statut: 'annule_commercant' }) === false)
  verifie('🔴 l’absent garde sa garantie', webhookRendLesAvantagesRdv({ total: true, statut: 'no_show' }) === false)
  verifie('🔴 un rendez-vous encore debout garde ses avantages', webhookRendLesAvantagesRdv({ total: true, statut: 'confirme' }) === false)
  verifie('un rendez-vous honoré aussi', webhookRendLesAvantagesRdv({ total: true, statut: 'honore' }) === false)
}

// ═══ 5) UN SEUL CALCUL, PARTAGÉ ═══════════════════════════════════════════
for (const chemin of [
  'app/api/stripe/checkout/create-rdv-commande/route.js',
  'app/api/stripe/checkout/create-rdv-acompte/route.js',
  'app/commander/rdv/[slug]/page.js',
]) {
  const src = lireCode(chemin)
  const court = chemin.split('/').slice(-2).join('/')
  verifie(`${court} : utilise le module de ventilation`, /ventilerTunnelRdv\(/.test(src))
  // ⚠️ ET NE RECALCULE PLUS L'ACOMPTE À LA MAIN : c'est cette recopie qui a
  // dérivé et produit le « 8,75 € » d'un acompte jamais payé.
  verifie(`${court} : ne recalcule plus l’acompte à la main`,
    !/Math\.round\(prix\w*\s*\*\s*acompte\w*\)\s*\/\s*100/.test(src))
}
{
  const src = lireCode('app/commander/rdv/[slug]/page.js')

  // 🔴 LES DEUX BOUTS DU FIL, ET C'EST NEUF (30/08).
  //
  // L'appel au tunnel avec produits partait en `fetch` NU : aucun en-tête
  // d'autorisation, donc `identiteProuvee` ne voyait qu'un invité et refusait
  // la récompense. Alex lisait « Connecte-toi pour utiliser ta récompense
  // fidélité » en étant parfaitement connecté, et le paiement était bloqué.
  //
  // ⚠️ MON BANC NE REGARDAIT QU'UNE MOITIÉ DE LA CONVERSATION : il vérifiait
  // que la ROUTE exige une preuve, jamais que l'APPELANT en envoie une. Une
  // exigence sans émetteur est un refus garanti.
  for (const route of ['create-rdv-acompte', 'create-rdv-commande']) {
    const appel = (src.match(new RegExp(`[\\w]+\\('/api/stripe/checkout/${route}'`)) || [''])[0]
    verifie(`l'appel à ${route} porte la preuve d'identité`,
      /fetchAvecPreuveSiConnecte\(/.test(appel), appel || 'appel introuvable')
    // ⚠️ ET SURTOUT PAS `fetchYopper`, qui refuserait l'appel faute de
    // session : un invité doit pouvoir réserver, sans récompense.
    verifie(`${route} n'exige pas une session pour un invité`,
      !/fetchYopper\(/.test(appel))
  }

  // 🔴 LE CLICHÉ DE SESSION PORTE LA VENTILATION : sans elle, l'écran de
  // retour de Stripe ne peut rien dire de ce qui vient d'être payé.
  verifie('le cliché de session porte la ventilation', /ventilation: ventFigee/.test(src))
  verifie('et l’écran de confirmation la lit', /_ventilation/.test(src))
  // ✅ UN AVANTAGE NE S'ÉVAPORE PLUS, ET ON NE LE REFUSE PLUS NON PLUS (30/08).
  //
  // Il a existé ici une garde d'écran : quand le bon annulait l'acompte, le
  // rendez-vous basculait sur l'insertion DIRECTE, qui ne débite rien, donc on
  // refusait la réservation. Le remède réel était une route serveur, elle
  // existe, et le refus a disparu avec elle.
  //
  // ⚠️ CE QUI SE VÉRIFIE MAINTENANT EST PLUS FORT : l'écran n'écrit plus dans
  // la table, et la seule sortie sans paiement passe par le serveur. Une garde
  // d'écran n'est jamais une réponse ; celle-ci mesure qu'il n'y a plus d'écran
  // à garder.
  verifie('l’écran n’insère plus aucun rendez-vous lui-même',
    !/from\('rdv_reservations'\)\s*\.insert/.test(src))
  verifie('et la réservation sans paiement passe par la route serveur',
    /fetchAvecPreuveSiConnecte\('\/api\/rdv\/reserver'/.test(src))
  verifie('l’ancien refus « le bon couvre déjà tout » a disparu',
    !/couvre déjà tout/.test(src))
}
{
  const src = lireCode('app/api/stripe/checkout/create-rdv-commande/route.js')
  // ⚠️ DEUX CIBLES, DEUX MOUVEMENTS. La contrainte
  // `bons_cadeaux_mouvements_une_cible` interdit un mouvement qui désignerait
  // à la fois une commande et un rendez-vous.
  //
  // 🔴 ET DEPUIS LE 01/09, DEUX LISTES : un même bon peut financer les deux
  // parts, mais chaque objet ne porte QUE ce qui lui revient. Les confondre
  // ferait rendre deux fois à l'annulation.
  verifie('la part produits vit sur la commande',
    /bon_cadeau_montant: partsBons\.totalProduits/.test(src)
    && /bons_utilises: bonsProduits/.test(src))
  verifie('la part prestation part dans les métadonnées du rendez-vous',
    /bon_cadeau_montant: String\(partsBons\.totalPresta\)/.test(src)
    && /bons_utilises: JSON\.stringify\(bonsPresta\)/.test(src))
  // 🔴 ET LES DEUX LISTES SORTENT DU MÊME PARTAGE, calculé UNE FOIS. Deux
  // appels séparés se recouvriraient : un bon de 50 € paierait 50 € de
  // prestation ET 50 € de produits, soit 100 € pris sur un solde de 50.
  //
  // ⚠️ LES DEUX LISTES SONT NOMMÉES, pas seulement l'appel : la mutation qui
  // recalculait `bonsProduits` de son côté laissait l'appel d'origine en place,
  // et une garde qui ne visait que lui restait verte.
  verifie('les deux parts viennent du même partage',
    /repartirBonsRdv\(bonsValides, \{[\s\S]{0,120}surPresta: vent\.bonSurPresta[\s\S]{0,120}surProduits: vent\.bonSurProduits/.test(src)
    && /const bonsPresta = partsBons\.presta\.map/.test(src)
    && /const bonsProduits = partsBons\.produits\.map/.test(src))
  // ⚠️ UN SEAU QUI NE SE REMPLIT PAS EST UNE INCOHÉRENCE INTERNE : la
  // ventilation et le partage ne seraient pas d'accord. On le crie.
  verifie('un partage incomplet est journalisé, pas avalé',
    /repartition des bons incomplète/.test(src))
  // ⚠️ STRIPE N'ACCEPTE AUCUN MONTANT NÉGATIF : garder le détail au prix plein
  // ferait payer au client ce que son bon vient de couvrir.
  verifie('le détail laisse la place à une ligne unique quand un avantage mord',
    /if \(deduitSurProduits\)/.test(src))
  // ✅ ET UN PANIER ENTIÈREMENT COUVERT EST CONFIRMÉ SANS STRIPE (30/08). Il
  // était REFUSÉ : « ton bon couvre la totalité, réserve sans produits ». Le cas
  // le plus favorable au client était le seul qu'on renvoyait au comptoir.
  //
  // ⚠️ LE SERVEUR LE CALCULE, il ne le reçoit pas : sinon il suffirait
  // d'annoncer « c'est couvert » pour réserver sans payer. On mesure la
  // DÉFINITION, pas le nom : la remplacer par `true` gardait le nom en place.
  const defCouvert = (src.match(/const couvertSansPaiement = [^\n]*/) || [''])[0]
  //
  // 🔴 ET IL TESTE LES BONS REÇUS, PAS `bonCadeau`. Celui-ci est le premier bon
  // servi SUR LA PRESTATION : quand les bons ne paient que les produits (prix
  // sur devis, ou récompense qui couvre déjà la prestation), il vaut `null`
  // alors que des bons ont bien payé. Y accrocher cette garde renverrait au
  // comptoir un rendez-vous entièrement couvert.
  verifie('« couvert » se déduit du total ET d’un avantage réel',
    /totalCents === 0/.test(defCouvert)
    && /bonsValides\.length > 0/.test(defCouvert) && /recompense/.test(defCouvert), defCouvert)
  verifie('et il n’est jamais reçu du navigateur',
    !/couvertSansPaiement\s*[,}]/.test(src.split('const body =')[1]?.split('}')[0] || ''))
  verifie('le rendez-vous se crée alors côté serveur',
    /if \(couvertSansPaiement\) \{/.test(src) && /creerReservationRdv\(supabase, \{/.test(src))
  // ⚠️ ET LES DEUX MOUVEMENTS DU BON PARTENT, un par cible : la contrainte
  // `bons_cadeaux_mouvements_une_cible` interdit un mouvement qui désignerait
  // les deux à la fois.
  verifie('les bons sont débités sur la prestation ET sur les produits',
    /debiterBons\(supabase, bonsPresta, \{ source: 'rdv'/.test(src)
    && /debiterBons\(supabase, bonsProduits, \{ source: 'commande'/.test(src))
  // ⚠️ ET ON REND CE QU'ON VIENT DE PRENDRE si le second débit échoue : laisser
  // la part prestation dépensée ferait perdre de l'argent au porteur du bon
  // pour une réservation qui n'a pas eu lieu.
  //
  // ⚠️ TOUS LES BONS, PAS LE PREMIER : la liste qui a servi au débit est
  // exactement celle qui sert au retour.
  // 🔴 ET LA GARDE EXIGE LA CONDITION, PAS SEULEMENT L'APPEL (04/09).
  //
  // Elle ne cherchait que `recrediterBons(supabase, bonsPresta, …)`. Neutraliser
  // la condition en `if (false)` laissait donc le texte en place et la garde au
  // vert : elle mesurait la PRÉSENCE d'un appel, pas le fait qu'il s'exécute.
  // C'est la mesure par mutation qui l'a dit — la garde était verte pour une
  // raison qui n'était pas la bonne.
  verifie('un second débit raté recrédite TOUS les premiers',
    /if \(bonsPresta\.length > 0\) await recrediterBons\(supabase, bonsPresta, \{ rdv_id: idRdv \}\)/.test(src))
  verifie('et la commande couverte est marquée payée en ligne',
    /paye_en_ligne: true/.test(src) && /rdv_reservation_id: idRdv/.test(src))
}

// ═══ 5 bis) LA CRÉATION DE RÉSERVATION, EXÉCUTÉE ══════════════════════════
//
// ⚠️ EXÉCUTÉE, PAS RELUE. Le lieu, la capacité, la place et la TVA vivaient en
// quatre copies : les gardes qui les surveillaient cherchaient `place_no:` dans
// quatre fichiers, c'est-à-dire une FORME, pas une RÈGLE. Une place figée à 1
// ou une capacité recopiée à côté seraient passées.
//
// La base est simulée : un objet qui rend ce qu'on lui a dit de rendre, et qui
// GARDE le payload inséré. C'est lui qu'on inspecte.
{
  const { creerReservationRdv } = await import('../lib/rdv-creation-server.js')

  function baseSimulee({ prestation, lieux = [], placesPrises = [], erreurInsert = null,
                         creneaux = [], liaisons = [], erreurPlaces = null,
                         fermetures = [], erreurFermetures = null, commercant = null }) {
    const vu = { payload: null, filtresPlaces: {} }
    // 🔴 LES PLAGES SONT RENDUES À TRAVERS LEUR SELECT (03/10). Le lieu de la
    // réservation vient désormais de `rdv_creneaux.lieu_id` : si la colonne
    // manquait au select, une fausse base qui rend l'objet COMPLET laisserait le
    // banc vert pendant que la vraie rendrait `undefined`. C'est le défaut le
    // plus fréquent de ce dépôt, et un banc qui ne le reproduit pas ne le voit pas.
    const projeter = (lignes, colonnes) => (typeof colonnes !== 'string' ? lignes
      : lignes.map(l => Object.fromEntries(colonnes.split(',').map(c => c.trim()).filter(Boolean).map(c => [c, l[c]]))))
    const table = (nom) => {
      const filtres = {}
      let colonnes = null
      const chaine = {
        select: (cols) => { if (colonnes === null) colonnes = cols; return chaine },
        eq: (col, val) => { filtres[col] = val; return chaine },
        in: (col, val) => { filtres[col] = val; return chaine },
        is: () => chaine,
        // ⚠️ AJOUTÉ LE 07/09, PARCE QUE CETTE FAUSSE BASE MENTAIT. `placePrise`
        // appelle `.neq`, qui n'existait pas ici : l'appel levait, l'erreur
        // était avalée par le `catch` du module, et le banc restait vert sur un
        // chemin qui n'avait jamais tourné. Une fausse base incomplète est un
        // banc qui se croit plus large qu'il n'est.
        neq: (col, val) => { filtres[col] = val; return chaine },
        // ⚠️ LA PRESTATION AUSSI PASSE PAR SON SELECT (I9, 03/10) : `deleted_at`
        // absent du select, la vraie base rendrait `undefined` et une prestation
        // supprimée se réserverait ; un objet complet ici l'aurait caché.
        maybeSingle: async () => ({
          data: nom === 'rdv_prestations' ? (prestation ? projeter([prestation], colonnes)[0] : prestation)
            : nom === 'commercants' ? projeter([commercant || { id: 'c1', nom: 'Ciseaux et Soins', adresse: 'Rue du Siège 1' }], colonnes)[0]
            : null,
        }),
        single: async () => ({
          data: { id: 'rdv-1', numero_rdv: 42, numero_prefixe: 'RV', place_no: vu.payload?.place_no },
          error: erreurInsert,
        }),
        insert: (p) => { vu.payload = p; return chaine },
        // Les lectures sans `.single()` sont attendues directement : la chaîne
        // doit donc être « thenable », comme l'est un client Supabase.
        then: (resoudre) => resoudre(
          nom === 'commercant_lieux' ? { data: lieux }
          : nom === 'rdv_creneaux' ? { data: projeter(creneaux, colonnes) }
          : nom === 'rdv_creneau_prestations' ? { data: liaisons }
          // ⚠️ À TRAVERS LE SELECT (04/10) : sans `prestation_id, heure_debut`,
          // la fermeture d'une séance se lirait comme une journée entière.
          : nom === 'rdv_fermetures' ? { data: erreurFermetures ? null : projeter(fermetures, colonnes), error: erreurFermetures }
          : nom === 'rdv_reservations' ? (vu.filtresPlaces = filtres, erreurPlaces
            ? { data: null, error: erreurPlaces }
            // ⚠️ À TRAVERS LE SELECT (04/10) : une inscription peut porter son
            // adresse et sa fiche, et le refus « déjà inscrit » ne les voit que
            // si le select les demande.
            : { data: projeter(placesPrises.map(p => (typeof p === 'object' ? p : { place_no: p })), colonnes) })
          : { data: [] }
        ),
      }
      return chaine
    }
    return { from: table, _vu: vu }
  }

  const PRESTA_SOLO = { id: 'p1', nom: 'Coupe', capacite: 1, tva_taux: 21, duree_minutes: 45, commercant_id: 'c1' }
  const PRESTA_COURS = { id: 'p2', nom: 'Hatha yoga', capacite: 12, tva_taux: 6, duree_minutes: 60, commercant_id: 'c1' }

  // ── Le cas ordinaire : un rendez-vous individuel ────────────────────────
  {
    const db = baseSimulee({ prestation: PRESTA_SOLO })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p1',
      dateRdv: '2026-09-07', heureDebut: '10:00',
      champs: { client_email: 'a@b.be', prix_estime: 35 },
    })
    verifie('la création rend le rendez-vous créé', res.ok === true && res.rdv?.id === 'rdv-1')
    egal('la capacité gravée vaut 1 sur une prestation solo', db._vu.payload.capacite_creneau, 1)
    egal('et la place vaut 1', db._vu.payload.place_no, 1)
    egal('la TVA est figée depuis la prestation', db._vu.payload.tva_taux, 21)
    verifie('les champs de l’appelant sont conservés',
      db._vu.payload.client_email === 'a@b.be' && db._vu.payload.prix_estime === 35)
    verifie('le commerce et la prestation sont écrits',
      db._vu.payload.commercant_id === 'c1' && db._vu.payload.prestation_id === 'p1')
    // ⚠️ L'HEURE EST NORMALISÉE EN HH:MM. Une heure en HH:MM:SS ne trouverait
    // aucune place prise et en redonnerait une déjà occupée.
    verifie('l’heure est normalisée', db._vu.payload.heure_debut === '10:00')
  }

  // ── 🔴 CE QUE COÛTE UN NOMBRE DE PERSONNES OUBLIÉ (14/09) ───────────────
  //
  // La route d'acompte ne lisait pas `couverts`, il n'entrait donc pas dans les
  // métadonnées Stripe et le webhook ne le passait pas au module. Ce banc
  // montre le prix exact de cet oubli, EN EXÉCUTANT : sur une prestation à
  // couverts, le module REFUSE de créer la réservation. Le client avait payé,
  // la table n'existait pas, et le webhook rejouait sans fin.
  {
    const PRESTA_TABLE = { id: 'p3', nom: 'Table', capacite: 40, tva_taux: 12,
      duree_minutes: 90, commercant_id: 'c1', par_couverts: true, couverts_min: 1, couverts_max: 10 }

    const dbSans = baseSimulee({ prestation: PRESTA_TABLE })
    const sans = await creerReservationRdv(dbSans, {
      commercantId: 'c1', prestationId: 'p3',
      dateRdv: '2026-09-19', heureDebut: '20:00',
      champs: { client_email: 'a@b.be' },
    })
    verifie('🔴 sans le nombre de personnes, la table ne se crée PAS',
      sans.ok === false && sans.code === 'couverts_invalides')
    verifie('et rien n’a été inséré', dbSans._vu.payload === null)

    const dbAvec = baseSimulee({ prestation: PRESTA_TABLE })
    const avec = await creerReservationRdv(dbAvec, {
      commercantId: 'c1', prestationId: 'p3',
      dateRdv: '2026-09-19', heureDebut: '20:00',
      champs: { client_email: 'a@b.be', couverts: 6 },
    })
    verifie('avec le nombre de personnes, la table se crée', avec.ok === true)
    egal('et les six couverts sont GRAVÉS', dbAvec._vu.payload?.couverts, 6)
  }

  // ── LA PLACE LIBÉRÉE AU MILIEU, le cœur du sujet ────────────────────────
  {
    const db = baseSimulee({ prestation: PRESTA_COURS, placesPrises: [1, 2, 4] })
    await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-09-07', heureDebut: '18:30', champs: {},
    })
    // 🔴 SI CE NOMBRE VAUT 4, C'EST QU'ON COMPTE AU LIEU DE CHERCHER : la place
    // 3 a été libérée par une annulation, l'index unique rejetterait la 4.
    egal('la place est la première LIBRE, pas « inscrits + 1 »', db._vu.payload.place_no, 3)
    egal('et la capacité du cours est gravée', db._vu.payload.capacite_creneau, 12)
    // ⚠️ LES PLACES SE LISENT SUR CETTE SÉANCE-LÀ, pas sur la journée : sans le
    // filtre de prestation, deux cours à la même heure se voleraient leurs
    // places.
    verifie('les places prises sont lues sur la bonne séance',
      db._vu.filtresPlaces.date_rdv === '2026-09-07'
      && db._vu.filtresPlaces.heure_debut === '18:30'
      && db._vu.filtresPlaces.prestation_id === 'p2')
    // ⚠️ ET SEULS LES STATUTS QUI OCCUPENT COMPTENT : un rendez-vous annulé
    // libère sa place, la compter la rendrait introuvable.
    verifie('et seuls les rendez-vous vivants occupent une place',
      Array.isArray(db._vu.filtresPlaces.statut)
      && db._vu.filtresPlaces.statut.includes('confirme')
      && !db._vu.filtresPlaces.statut.includes('annule_client'))
  }

  // ── 🔴 UN COURS COMPLET REFUSE (audit du 03/10) ──────────────────────────
  //
  // La place retombait sur « 1 » quand il n'en restait aucune, et seul l'index
  // unique devait refuser. Or il range les places PAR PROFESSEUR : chez un
  // studio à deux professeurs, une séance d'abonnement (sans professeur) et
  // une réservation chez Emily ne s'y croisaient jamais. Treize inscrites dans
  // un cours de douze. EXÉCUTÉ : le module refuse, et n'écrit rien.
  {
    const plein = Array.from({ length: 12 }, (_, i) => i + 1)
    const db = baseSimulee({ prestation: PRESTA_COURS, placesPrises: plein })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-10-07', heureDebut: '10:00',
      champs: { client_email: 'treizieme@yoppaa.app' },
    })
    verifie('🔴 un cours de douze déjà plein refuse la treizième',
      res.ok === false && res.code === 'place_prise' && res.collectif === true, JSON.stringify(res))
    verifie('🔴 et rien n’est écrit, aucune place « 1 » de secours', db._vu.payload === null)

    const presque = baseSimulee({ prestation: PRESTA_COURS, placesPrises: plein.slice(0, 11) })
    const derniere = await creerReservationRdv(presque, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-10-07', heureDebut: '10:00', champs: {},
    })
    verifie('✅ la douzième place, elle, se donne', derniere.ok === true && presque._vu.payload?.place_no === 12,
      JSON.stringify(presque._vu.payload?.place_no))

    // ⚠️ SANS LA LISTE DES PLACES, ON NE SAIT PAS SI LE COURS EST COMPLET.
    const aveugle = baseSimulee({ prestation: PRESTA_COURS, erreurPlaces: { message: 'panne' } })
    const resAveugle = await creerReservationRdv(aveugle, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-10-07', heureDebut: '10:00', champs: {},
    })
    verifie('🔴 une lecture des places en échec refuse au lieu de deviner',
      resAveugle.ok === false && resAveugle.code === 'ecriture_impossible' && aveugle._vu.payload === null,
      JSON.stringify(resAveugle))

    // ⚠️ ET LA BASE FERME LA COURSE ENTRE DEUX ÉCRITURES SIMULTANÉES.
    const sql = lire('migrations/MIGRATION_PLACE_PAR_COURS.sql').replace(/^\s*--.*$/gm, ' ')
    verifie('🔴 la base range les places par COURS, pas par professeur',
      /CREATE UNIQUE INDEX IF NOT EXISTS rdv_une_place_par_cours\s+ON public\.rdv_reservations \(commercant_id, prestation_id, date_rdv, heure_debut, place_no\)\s+WHERE statut IN \('confirme', 'honore'\) AND deleted_at IS NULL AND capacite_creneau > 1;/.test(sql)
      && !/rdv_une_place_par_cours[^;]*praticien_id/.test(sql))
    verifie('⚠️ la migration refuse des doublons existants, et les nomme',
      /IF doublons IS NOT NULL THEN\s+RAISE EXCEPTION 'PLACES_EN_DOUBLE/.test(sql))
    verifie('⚠️ et tient dans une transaction', sql.indexOf('BEGIN;') < sql.indexOf('CREATE UNIQUE INDEX')
      && sql.indexOf('COMMIT;') > sql.indexOf('CREATE UNIQUE INDEX'))
  }

  // ── LE LIEU GRAVÉ : celui de la plage que le serveur valide (03/10) ─────
  //
  // 🔴 L'ÉCRAN ENVOYAIT LA PLAGE D'UN AUTRE JOUR, ET LE SERVEUR LA CROYAIT. La
  // fiche prenait « la première plage dont les heures contiennent l'heure »
  // parmi TOUTES celles de la semaine. Chez une professeure qui donne cours le
  // lundi dans une salle et le jeudi dans une autre à la même heure, l'inscrite
  // du jeudi recevait l'adresse du lundi. Et les paiements par acompte ne
  // transmettaient aucun lieu : la plage était ignorée.
  {
    const LIEUX = [
      { id: 'L1', type: 'hebdo', jour_semaine: 'lundi', libelle: 'Salle du Centre', adresse: 'Place 3', heure_debut: '18:00', heure_fin: '21:00', actif: true },
      { id: 'L2', type: 'hebdo', jour_semaine: 'lundi', libelle: 'Salle des Fêtes', adresse: 'Rue Haute 9', heure_debut: '09:00', heure_fin: '12:00', actif: true },
    ]
    const PLAGE = { id: 'cr-lun', jour_semaine: 'lundi', date_specifique: null, heure_debut: '18:00:00', heure_fin: '21:00:00',
      pause_debut: null, pause_fin: null, actif: true, praticien_id: null, lieu_id: 'L2' }

    // SANS CE CHOIX, LA CONFIRMATION ENVOIE AU SIÈGE SOCIAL, donc au domicile
    // d'une commerçante inscrite chez elle mais qui donne cours en salle.
    // ⚠️ LA PLAGE DU JEUDI, MÊME HEURE, AUTRE SALLE, EST LUE EN PREMIER : c'est
    // exactement le piège de l'écran. Le lundi doit garder la sienne.
    const JEUDI = { ...PLAGE, id: 'cr-jeu', jour_semaine: 'jeudi', lieu_id: 'L1' }
    const parLaPlage = baseSimulee({ prestation: PRESTA_COURS, lieux: LIEUX, creneaux: [JEUDI, PLAGE] })
    await creerReservationRdv(parLaPlage, {
      commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-09-07', heureDebut: '18:30', champs: {},
    })
    verifie('🔴 le lieu de la plage validée l’emporte sur l’heure, sans que personne ne l’envoie',
      parLaPlage._vu.payload.lieu_id === 'L2' && parLaPlage._vu.payload.lieu_libelle === 'Salle des Fêtes',
      JSON.stringify(parLaPlage._vu.payload?.lieu_id))

    const ecranTrompe = baseSimulee({ prestation: PRESTA_COURS, lieux: LIEUX, creneaux: [{ ...PLAGE, lieu_id: null }] })
    await creerReservationRdv(ecranTrompe, {
      commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-09-07', heureDebut: '18:30', lieuId: 'L2', champs: {},
    })
    verifie('🔴 le lieu envoyé par un client ne compte plus : c’était la plage d’un autre jour',
      ecranTrompe._vu.payload.lieu_id === 'L1', JSON.stringify(ecranTrompe._vu.payload?.lieu_id))

    // ⚠️ LE COMMERÇANT, LUI, GARDE SON CHOIX. Il pose un rendez-vous où il
    // veut, hors plage compris : c'est son agenda.
    const auComptoir = baseSimulee({ prestation: PRESTA_COURS, lieux: LIEUX })
    await creerReservationRdv(auComptoir, {
      commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-09-07', heureDebut: '18:30', lieuId: 'L2',
      champs: { source: 'commercant' },
    })
    verifie('⚠️ le lieu choisi par le commerçant reste le sien',
      auComptoir._vu.payload.lieu_id === 'L2', JSON.stringify(auComptoir._vu.payload?.lieu_id))
  }
  {
    const LIEUX = [
      { id: 'L1', type: 'hebdo', jour_semaine: 'lundi', libelle: 'Salle du Centre', adresse: 'Place 3', heure_debut: '18:00', heure_fin: '21:00', actif: true },
    ]
    const db = baseSimulee({ prestation: PRESTA_COURS, lieux: LIEUX })
    await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-09-07', heureDebut: '18:30', champs: {},
    })
    verifie('et sans plage désignée, le lieu se résout à l’heure',
      db._vu.payload.lieu_id === 'L1')
  }

  // ── LES FERMETURES SE RESPECTENT AU SERVEUR (03/10) ──────────────────────
  //
  // 🔴 AUCUNE ROUTE NE LISAIT `rdv_fermetures`. La fiche grisait les jours de
  // congé, mais une fiche restée ouverte, une requête forgée ou le webhook d'un
  // acompte posaient un rendez-vous en plein congé.
  {
    const CONGES = [{ date_debut: '2026-09-07', date_fin: '2026-09-11', praticien_id: null }]
    const RESA = { commercantId: 'c1', prestationId: 'p1', dateRdv: '2026-09-07', heureDebut: '10:00' }
    const ferme = baseSimulee({ prestation: PRESTA_SOLO, fermetures: CONGES })
    const r1 = await creerReservationRdv(ferme, { ...RESA, champs: {} })
    verifie('🔴 un jour de congé refuse la réservation, et n’écrit rien',
      r1.ok === false && r1.code === 'jour_ferme' && ferme._vu.payload === null, JSON.stringify(r1))
    // ⚠️ ET AVANT LE PAIEMENT : les routes d'acompte vérifient par ce chemin-là.
    const sim = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO, fermetures: CONGES }), { ...RESA, champs: {}, simulation: true })
    verifie('🔴 la vérification avant paiement le refuse aussi', sim.ok === false && sim.code === 'jour_ferme', JSON.stringify(sim))
    // 🔴 UN COURS ANNULÉ (question 1, 04/10) : cette séance seulement.
    const COURS_ANNULE = [{ date_debut: '2026-09-07', date_fin: '2026-09-07', praticien_id: null, prestation_id: 'p2', heure_debut: '18:00:00' }]
    const SEANCE = { commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-09-07', heureDebut: '18:00' }
    const annule = baseSimulee({ prestation: PRESTA_COURS, fermetures: COURS_ANNULE })
    const r9 = await creerReservationRdv(annule, { ...SEANCE, champs: {} })
    verifie('🔴 un cours annulé se refuse en ligne, avec son propre motif, et rien ne s’écrit',
      r9.ok === false && r9.code === 'seance_fermee' && annule._vu.payload === null, JSON.stringify(r9))
    const r10 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_COURS, fermetures: COURS_ANNULE }), { ...SEANCE, heureDebut: '19:00', champs: {} })
    verifie('⚠️ le même cours, à une autre heure du même jour, se réserve', r10.ok === true, JSON.stringify(r10))
    const r11 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_COURS, fermetures: COURS_ANNULE }), { ...SEANCE, champs: { source: 'commercant' } })
    verifie('⚠️ la commerçante, elle, peut encore y inscrire quelqu’un au comptoir', r11.ok === true, JSON.stringify(r11))
    const dernierJour = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO, fermetures: CONGES }), { ...RESA, dateRdv: '2026-09-11', champs: {} })
    verifie('⚠️ le dernier jour de la fermeture est fermé aussi', dernierJour.ok === false && dernierJour.code === 'jour_ferme')
    const lendemain = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO, fermetures: CONGES }), { ...RESA, dateRdv: '2026-09-12', champs: {} })
    verifie('le lendemain de la fermeture se réserve', lendemain.ok === true, JSON.stringify(lendemain))
    const comptoir = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO, fermetures: CONGES }), { ...RESA, champs: { source: 'commercant' } })
    verifie('⚠️ le commerçant, lui, pose ce qu’il veut dans son agenda', comptoir.ok === true, JSON.stringify(comptoir))
    const panne = baseSimulee({ prestation: PRESTA_SOLO, erreurFermetures: { message: 'délai dépassé' } })
    const r2 = await creerReservationRdv(panne, { ...RESA, champs: {} })
    verifie('⚠️ une lecture des fermetures en échec refuse, sans écrire',
      r2.ok === false && r2.code === 'ecriture_impossible' && panne._vu.payload === null, JSON.stringify(r2))
  }
  {
    // 🔴 LE COURS DE LA PROFESSEURE EN CONGÉ, RÉSERVÉ « SANS PRÉFÉRENCE ». Seules
    // les fermetures du commerce bloquaient un jour : la cliente n'avait nommé
    // personne, et la plage, qui dit qui donne le cours, n'était pas lue.
    const PLAGE_EMILY = { id: 'cr-emily', jour_semaine: 'lundi', date_specifique: null, heure_debut: '18:00:00', heure_fin: '19:00:00',
      pause_debut: null, pause_fin: null, actif: true, praticien_id: 'emily', lieu_id: null }
    const LIAISONS = [{ creneau_id: 'cr-emily', prestation_id: 'p2' }]
    const ABSENTE = [{ date_debut: '2026-09-07', date_fin: '2026-09-07', praticien_id: 'emily' }]
    const RESA = { commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-09-07', heureDebut: '18:00' }
    const base = (creneaux = [PLAGE_EMILY]) => baseSimulee({ prestation: PRESTA_COURS, creneaux, liaisons: LIAISONS, fermetures: ABSENTE })

    const db = base()
    const r = await creerReservationRdv(db, { ...RESA, champs: {} })
    verifie('🔴 sans préférence, le cours d’une professeure absente est refusé',
      r.ok === false && r.code === 'jour_ferme' && db._vu.payload === null, JSON.stringify(r))
    const nommee = await creerReservationRdv(base(), { ...RESA, champs: { praticien_id: 'emily' } })
    verifie('🔴 et nommément aussi', nommee.ok === false && nommee.code === 'jour_ferme', JSON.stringify(nommee))
    const semaineSuivante = await creerReservationRdv(base(), { ...RESA, dateRdv: '2026-09-14', champs: {} })
    verifie('la semaine suivante, son cours rouvre', semaineSuivante.ok === true, JSON.stringify(semaineSuivante))
    const commune = await creerReservationRdv(base([{ ...PLAGE_EMILY, praticien_id: null }]), { ...RESA, champs: {} })
    verifie('⚠️ une plage commune reste ouverte quand une seule professeure est absente', commune.ok === true, JSON.stringify(commune))
  }

  // ── CE QU'UNE FERMETURE RATTRAPE, ET LE COURS QU'ON ANNULE (B2, B1, 03/10) ─
  //
  // 🔴 UNE FERMETURE N'ANNULAIT RIEN, ET NE LE DISAIT PAS ; L'AGENDA NE LA
  // GRISAIT PAS ; ET UN COURS ENTIER NE S'ANNULAIT QU'INSCRITE PAR INSCRITE.
  {
    // ⚠️ `egal` compare des NOMBRES dans ce banc : ici on compare des textes.
    const memes = (nom, obtenu, attendu) => verifie(nom, obtenu === attendu, `obtenu ${obtenu}, attendu ${attendu}`)
    const { rdvsSousLaFermeture, fermeturesDuJour } = await import('../lib/fermetures-rdv.js')
    const RDVS = [
      { id: 'a', statut: 'confirme', date_rdv: '2026-10-19', praticien_id: 'emily' },
      { id: 'b', statut: 'confirme', date_rdv: '2026-10-23', praticien_id: 'carole' },
      { id: 'c', statut: 'confirme', date_rdv: '2026-10-25', praticien_id: null },
      { id: 'd', statut: 'annule_client', date_rdv: '2026-10-20', praticien_id: 'emily' },
      { id: 'e', statut: 'confirme', date_rdv: '2026-10-26', praticien_id: 'emily' },
      { id: 'f', statut: 'honore', date_rdv: '2026-10-19', praticien_id: 'emily' },
    ]
    const ids = (l) => l.map(r => r.id).sort().join(',')
    memes('🔴 une fermeture du commerce rattrape tous les rendez-vous vivants de ses dates, bornes comprises',
      ids(rdvsSousLaFermeture(RDVS, { date_debut: '2026-10-19', date_fin: '2026-10-25', praticien_id: null })), 'a,b,c')
    memes('🔴 l’absence d’une praticienne ne rattrape que les siens',
      ids(rdvsSousLaFermeture(RDVS, { date_debut: '2026-10-19', date_fin: '2026-10-26', praticien_id: 'emily' })), 'a,e')
    memes('⚠️ ni un rendez-vous annulé, ni un rendez-vous déjà honoré, ni une plage commune',
      ids(rdvsSousLaFermeture(RDVS, { date_debut: '2026-10-19', date_fin: '2026-10-25', praticien_id: 'emily' })), 'a')
    memes('l’agenda nomme les fermetures d’un jour',
      fermeturesDuJour([{ date_debut: '2026-10-19', date_fin: '2026-10-25', praticien_id: null }, { date_debut: '2026-11-01', date_fin: '2026-11-01', praticien_id: 'e' }], '2026-10-25').length, 1)

    const { questionSeanceAnnulee, confirmationSeanceAnnulee } = await import('../lib/confirmation-rdv.js')
    const q = questionSeanceAnnulee(12)
    verifie('🔴 annuler un cours : une seule question pour les douze',
      q?.titre === 'Annuler ce cours pour les 12 personnes inscrites ?' && q.actions[0].valeur === 'annuler' && q.actions[0].ton === 'danger')
    // ⚠️ REPOINTÉE LE 04/10 (question 1) : les places ne se rouvrent plus, le
    // cours se ferme. La question doit dire CE qui arrive, comme avant.
    verifie('🔴 et elle dit que le cours se ferme aussi à la réservation en ligne',
      /Le cours est aussi fermé à la réservation en ligne\./.test(q?.details || '') && !/redeviennent réservables/.test(q?.details || ''))
    verifie('🔴 une fermeture du cours ratée se dit, avec le geste qui répare',
      /le cours n’a pas pu être fermé à la réservation en ligne/.test(confirmationSeanceAnnulee({ faits: 2, coursFerme: false }))
      && !/pas pu être fermé/.test(confirmationSeanceAnnulee({ faits: 2 })))

    // ── LA FERMETURE D'UNE SÉANCE (question 1, Alex 04/10) ───────────────
    {
      const { fermetureQuiBloque: bloque, plagesOuvertes: ouvertes, seanceFermee, estFermetureDeSeance } = await import('../lib/fermetures-rdv.js')
      const YOGA_LUNDI = { date_debut: '2026-10-19', date_fin: '2026-10-19', praticien_id: null, prestation_id: 'yoga', heure_debut: '18:00:00' }
      verifie('🔴 un cours annulé bloque CE cours à CETTE heure',
        bloque([YOGA_LUNDI], { dateStr: '2026-10-19', prestationId: 'yoga', heure: '18:00' }) === YOGA_LUNDI && estFermetureDeSeance(YOGA_LUNDI))
      verifie('🔴 et rien d’autre : une autre heure, un autre cours, la journée',
        bloque([YOGA_LUNDI], { dateStr: '2026-10-19', prestationId: 'yoga', heure: '19:00' }) === null
        && bloque([YOGA_LUNDI], { dateStr: '2026-10-19', prestationId: 'pilates', heure: '18:00' }) === null
        && bloque([YOGA_LUNDI], { dateStr: '2026-10-19' }) === null)
      memes('🔴 l’agenda ne lit pas un cours annulé comme une journée fermée',
        fermeturesDuJour([YOGA_LUNDI], '2026-10-19').length, 0)
      memes('⚠️ et aucune plage ne se ferme pour lui',
        ouvertes([{ id: 'k', praticien_id: null }], [YOGA_LUNDI], '2026-10-19').length, 1)
      verifie('⚠️ la grille de la fiche retire la séance, et elle seule',
        seanceFermee([YOGA_LUNDI], { dateStr: '2026-10-19', prestationId: 'yoga', heure: '18:00' })
        && !seanceFermee([YOGA_LUNDI], { dateStr: '2026-10-19', prestationId: 'yoga', heure: '18:15' })
        && !seanceFermee([YOGA_LUNDI], { dateStr: '2026-10-20', prestationId: 'yoga', heure: '18:00' }))
      memes('⚠️ elle ne rattrape que les inscrites de ce cours, à cette heure',
        ids(rdvsSousLaFermeture([
          { id: 'y1', statut: 'confirme', date_rdv: '2026-10-19', heure_debut: '18:00:00', prestation_id: 'yoga' },
          { id: 'y2', statut: 'confirme', date_rdv: '2026-10-19', heure_debut: '19:00:00', prestation_id: 'yoga' },
          { id: 'p1', statut: 'confirme', date_rdv: '2026-10-19', heure_debut: '18:00:00', prestation_id: 'pilates' },
        ], YOGA_LUNDI)), 'y1')
      const { refusAvantPaiement: avantF, motifApresPaiement: apresF, estRefusDeRegle: regleF } = await import('../lib/refus-reservation.js')
      verifie('🔴 le refus d’un cours annulé renvoie à la grille, et se rembourse après paiement',
        avantF({ code: 'seance_fermee' }).corps.creneau_refuse === true
        && avantF({ code: 'seance_fermee' }).corps.error === 'Ce cours a été annulé par le commerce. Choisis un autre horaire.'
        && regleF('seance_fermee') && apresF('seance_fermee') !== apresF('inconnu'))
      // 🔴 CHAQUE LECTEUR DEMANDE LES DEUX COLONNES : sans elles, une séance
      // fermée se lit comme une JOURNÉE fermée (aucun praticien), et l'agenda,
      // la saisie au comptoir ou la fiche fermeraient toute la journée.
      for (const [f, motif] of [
        ['lib/rdv-creation-server.js', /\.from\('rdv_fermetures'\)\s*\.select\('date_debut, date_fin, praticien_id, prestation_id, heure_debut'\)/],
        ['lib/attente-rdv-server.js', /\.from\('rdv_fermetures'\)\s*\.select\('date_debut, date_fin, praticien_id, prestation_id, heure_debut'\)/],
        ['app/commander/rdv/[slug]/page.js', /\.from\('rdv_fermetures'\)\s*\.select\('date_debut, date_fin, praticien_id, prestation_id, heure_debut'\)/],
        ['app/dashboard/ModalNouveauRdv.js', /\.from\('rdv_fermetures'\)\s*\.select\('date_debut, date_fin, praticien_id, prestation_id, heure_debut'\)/],
        ['app/dashboard/page.js', /\.from\('rdv_fermetures'\)\s*\.select\('id, date_debut, date_fin, praticien_id, motif, prestation_id, heure_debut'\)/],
      ]) verifie(`🔴 ${f} lit la fermeture d’une séance`, motif.test(lireCode(f)))
      const FICHE_F = lireCode('app/commander/rdv/[slug]/page.js')
      verifie('🔴 la fiche retire la séance fermée de la grille ET des pastilles',
        /\.filter\(s => !seanceFermee\(fermetures, \{ dateStr, prestationId: prestationChoisie\?\.id, heure: s\.heure \}\)\)/.test(FICHE_F)
        && /!s\.pris && !seanceFermee\(fermetures, \{ dateStr: j\.iso, prestationId: prestationChoisie\?\.id, heure: s\.heure \}\)/.test(FICHE_F))
      const BORD_F = lireCode('app/dashboard/page.js')
      // ⚠️ ANCRE REPOINTÉE LE 04/10 : l'insertion rend son identifiant
      // (`fermetureCreee`), pour vider la liste d'attente du cours annulé.
      const iFerme = BORD_F.indexOf("const { data: fermetureCreee, error: errFermeture } = await supabase.from('rdv_fermetures').insert({")
      const iBoucle = BORD_F.indexOf('for (const rdv of seanceAAnnuler) {')
      verifie('🔴 « Annuler ce cours » ferme la séance AVANT de désinscrire',
        iFerme > 0 && iBoucle > iFerme
        && /prestation_id: seance\.prestation_id,\s*heure_debut: String\(seance\.heure_debut \|\| ''\)\.slice\(0, 5\),/.test(BORD_F)
        && /coursFerme: !errFermeture/.test(BORD_F))
      // ── QUESTION 7 : le calendrier lit toutes ses pages ────────────────────
      verifie('🔴 le calendrier à pastilles lit toutes les réservations, pas les 1 000 premières',
        /await toutesLesLignes\(\(\) => supabase\.rpc\('rdv_slots_busy_range', \{/.test(FICHE_F))
    }
    verifie('rien à annuler, rien à demander', questionSeanceAnnulee(0) === null)
    memes('⚠️ le bilan dit ce qui a été remboursé, au centime',
      confirmationSeanceAnnulee({ faits: 3, rembourse: 25 }), '3 personnes sont désinscrites et prévenues par email. 25,00 € d’acomptes sont remboursés.')
    verifie('🔴 et un remboursement raté se dit, au moment où on peut encore agir',
      /1 remboursement a échoué|Un remboursement a échoué/.test(confirmationSeanceAnnulee({ faits: 2, remboursementsRates: 1 })))
    verifie('⚠️ depuis une fermeture, ce sont des rendez-vous, pas des inscriptions',
      /^2 rendez-vous sont annulés, leurs clients sont prévenus par email\./.test(confirmationSeanceAnnulee({ faits: 2, rendezVous: true })))

    // ── Supprimer une plage : ce qu'elle porte encore (Audit 1 I15) ──
    {
      const { rdvsSurLaPlage } = await import('../lib/fermetures-rdv.js')
      // 2026-10-19 et 2026-10-26 sont des lundis, 2026-10-20 un mardi.
      const PLAGE = { jour_semaine: 'lundi', date_specifique: null, heure_debut: '18:00:00', heure_fin: '20:00:00', praticien_id: 'emily' }
      const R = [
        { id: 'oui', statut: 'confirme', date_rdv: '2026-10-19', heure_debut: '18:30:00', praticien_id: 'emily' },
        { id: 'autre-prof', statut: 'confirme', date_rdv: '2026-10-19', heure_debut: '18:30:00', praticien_id: 'carole' },
        { id: 'mardi', statut: 'confirme', date_rdv: '2026-10-20', heure_debut: '18:30:00', praticien_id: 'emily' },
        { id: 'fin-exclue', statut: 'confirme', date_rdv: '2026-10-26', heure_debut: '20:00:00', praticien_id: 'emily' },
        { id: 'annule', statut: 'annule_client', date_rdv: '2026-10-26', heure_debut: '18:00:00', praticien_id: 'emily' },
        { id: 'passe', statut: 'confirme', date_rdv: '2026-10-12', heure_debut: '18:00:00', praticien_id: 'emily' },
      ]
      memes('🔴 supprimer une plage dit ce qu’elle porte encore : son jour, ses heures, sa praticienne, à venir',
        R.length && rdvsSurLaPlage(R, PLAGE, { aujourdhui: '2026-10-15' }).map(r => r.id).join(','), 'oui')
      memes('⚠️ une plage commune porte les rendez-vous de toute la maison',
        rdvsSurLaPlage(R, { ...PLAGE, praticien_id: null }, { aujourdhui: '2026-10-15' }).map(r => r.id).join(','), 'oui,autre-prof')
      memes('⚠️ une plage d’un seul jour ne regarde que ce jour-là',
        rdvsSurLaPlage(R, { ...PLAGE, jour_semaine: null, date_specifique: '2026-10-20' }, { aujourdhui: '2026-10-15' }).map(r => r.id).join(','), 'mardi')
    }

    // ── Les écrans ──
    const AGENDA = sansProse(lire('app/dashboard/AgendaRdv.js'))
    verifie('🔴 l’agenda grise les fermetures, avec la règle du serveur',
      /if \(fermetureQuiBloque\(fermetures, \{ dateStr: jour\.iso, praticienId: praticienFiltre === 'all' \? null : praticienFiltre \}\)\) return 'conge'/.test(AGENDA)
      && /const bgCellule = state === 'conge'/.test(AGENDA))
    verifie('⚠️ et nomme la fermeture dans l’en-tête du jour', /const ferm = fermeturesDuJour\(fermetures, j\.iso\)/.test(AGENDA))
    verifie('🔴 un cours entier s’annule d’un geste, seulement ses inscrites confirmées, jamais un cours passé',
      /onAnnulerSeance && seanceOuverte\.jourDate && isoDate\(seanceOuverte\.jourDate\) >= isoDate\(today\)/.test(AGENDA)
      && /const aAnnuler = seanceOuverte\.inscrits\.filter\(i => i\.statut === 'confirme'\)/.test(AGENDA))
    const BORD = sansProse(lire('app/dashboard/page.js'))
    // ⚠️ VISÉE SUR L'AGENDA LE 04/10 : depuis Annul-I6, la fenêtre de
    // déplacement reçoit aussi `fermetures={fermeturesRdv}`, et la garde la
    // trouvait là quand l'agenda l'avait perdue (piège du jumeau).
    verifie('🔴 le tableau de bord charge les fermetures et les passe à l’agenda',
      /\.from\('rdv_fermetures'\)/.test(BORD) && /<AgendaRdv\s+rdvs=\{rdvs\}[^>]*?\sfermetures=\{fermeturesRdv\}/.test(BORD))
    verifie('🔴 chaque inscrite passe par l’annulation unitaire, en série',
      /for \(const rdv of seanceAAnnuler\) \{\s*const ok = await changerStatutRdv\(rdv\.id, 'annule_commercant', 'commercant', \{/.test(BORD))
    const CONF = sansProse(lire('app/dashboard/ConfigDashboard.js'))
    verifie('🔴 la fermeture montre les rendez-vous qu’elle rattrape, avec la même règle',
      /setTouches\(rdvsSousLaFermeture\(data \|\| \[\], ferm\)\)/.test(CONF))
    verifie('🔴 la suppression d’une plage compte ses rendez-vous avant de demander',
      /const poses = rdvsSurLaPlage\(avenir \|\| \[\], c, \{ aujourdhui: jourBruxelles\(\) \}\)/.test(CONF)
      && /message: `Tes clients ne pourront plus réserver sur cette plage\.\$\{avertissement\}`/.test(CONF))
    verifie('🔴 et propose de les annuler au lieu de se refermer en silence',
      /if \(restent\.length > 0\) setApres\(\{ touches: restent \}\)/.test(CONF)
      // ⚠️ REPOINTÉE LE 04/10 : l'appel porte aussi `prevenir_file: false` (une journée
      // fermée ne libère aucune place), mesuré dans verif:attente.
      && /const res = await postPro\('\/api\/rdv\/annuler-commercant', \{ rdv_id: r\.id, raison: 'commercant', prevenir_file: false \}\)/.test(CONF))
  }

  // ── LE RAPPEL DE LA VEILLE CHARGE CE QUE LE SOLDE LIT (Audit 2 I14, 03/10)
  // 🔴 Le bon cadeau manquait au select : « prévois 35 € » sur une coupe déjà
  // payée par un bon. On compare le select aux colonnes que lit `soldeRdv`.
  {
    const CRON = sansProse(lire('app/api/cron/rdv-reminder-9h/route.js'))
    const sel = (/\.select\(`([\s\S]*?)`\)/.exec(CRON) || [])[1] || ''
    for (const col of ['prix_estime', 'fidelite_remise', 'bon_cadeau_montant', 'acompte_montant']) {
      verifie(`🔴 le rappel de la veille charge ${col}, que le solde lit`, new RegExp(`\\b${col}\\b`).test(sel), sel.slice(0, 160))
    }
    verifie('⚠️ et l’un des deux marqueurs d’acompte payé', /\bacompte_paye(_en_ligne)?\b/.test(sel))
    const { soldeRdv } = await import('../lib/rdv-paiement.js')
    egal('et le solde déduit bien le bon', soldeRdv({ prix_estime: 35, bon_cadeau_montant: 35 }), 0)
  }

  // ── « INSCRIRE » DEPUIS UN COURS OUVRE LA SAISIE SUR CE COURS (Audit 1 I8) ─
  {
    const AG_I = sansProse(lire('app/dashboard/AgendaRdv.js'))
    const BD_I = sansProse(lire('app/dashboard/page.js'))
    const MO_I = sansProse(lire('app/dashboard/ModalNouveauRdv.js'))
    verifie('🔴 le panneau d’un cours passe le cours à la saisie',
      /const coursId = seanceOuverte\.inscrits\[0\]\?\.prestation_id \|\| null/.test(AG_I) && /onNouveauRdv\(jour, heure, coursId\)/.test(AG_I))
    verifie('🔴 le tableau de bord le transmet, et la saisie s’ouvre sur lui',
      /setNouveauRdvSlot\(\{ date, heure, prestationId \}\)/.test(BD_I) && /prestationInit=\{nouveauRdvSlot\.prestationId \|\| null\}/.test(BD_I)
      && /useState\(tableSeule \? UNE_TABLE : \(prestationInit \? String\(prestationInit\) : ''\)\)/.test(MO_I))
  }

  // ── UN REFUS HORS DÉLAI DIT LE JOUR ET OÙ APPELER (Annul-I5, 03/10) ─────
  {
    const CANCEL_R = sansProse(lire('app/api/rdv/cancel/route.js'))
    verifie('🔴 le refus hors délai dit le jour du rendez-vous et le numéro du commerce',
      /const quand = seanceLisible\(rdv\.date_rdv, heureFR\)/.test(CANCEL_R)
      && /const telephone = commercant\?\.telephone \? ` au \$\{commercant\.telephone\}` : ''/.test(CANCEL_R)
      && /Appelle directement \$\{commercant\?\.nom \|\| 'le commerce'\}\$\{telephone\}\./.test(CANCEL_R))
    const ESPACE_R = sansProse(lire('app/commander/page.js'))
    const fonctionAnnuler = (/async function annulerRdv\(rdv\) \{([\s\S]*?)\n  \}\n/.exec(ESPACE_R) || [])[1] || ''
    verifie('🔴 et il s’affiche dans la fenêtre de l’application, plus jamais dans un alert()',
      fonctionAnnuler.length > 500 && !/\balert\(/.test(fonctionAnnuler) && /informer\('Annulation impossible en ligne', a\.error\)/.test(fonctionAnnuler),
      `${fonctionAnnuler.length} caractères`)
  }

  // ── L'ANNULATION DU STUDIO ARRIVE AUSSI EN NOTIFICATION (Annul-I4, 03/10) ─
  {
    const ANNUL = sansProse(lire('app/api/rdv/annuler-commercant/route.js'))
    verifie('🔴 le client annulé par le studio reçoit une notification',
      /if \(pourQui\) \{[\s\S]{0,200}await envoyerPushParExternalId\(pourQui, \{/.test(ANNUL))
    verifie('🔴 retrouvé par son adresse quand le rendez-vous n’a pas de fiche',
      /if \(!pourQui && rdv\.client_email\) \{[\s\S]{0,200}\.eq\('email', normaliserEmail\(rdv\.client_email\)\)/.test(ANNUL))
    verifie('⚠️ la route charge ce que la notification dit',
      /client_id, client_email, date_rdv, heure_debut,/.test(ANNUL) && /commercant:commercants\(stripe_account_id, nom, categorie\)/.test(ANNUL))
  }

  // ── UN PAIEMENT QUI NE DÉMARRE PAS SE DIT EN FRANÇAIS (Audit 2 C1, 03/10) ─
  {
    const { messagePaiementRate } = await import('../lib/refus-reservation.js')
    const reseau = messagePaiementRate(new TypeError('Failed to fetch'), 'Centre Respire')
    verifie('🔴 une panne réseau ne sort plus en anglais technique',
      !/Failed to fetch|Erreur paiement/.test(reseau) && /réessaie, ou contacte Centre Respire/.test(reseau), reseau)
    verifie('🔴 la phrase du serveur passe telle quelle, sans « Erreur paiement : » ni second « réessaie »',
      messagePaiementRate(Object.assign(new Error('La dernière place vient d’être prise. Choisis un autre horaire.'), { duServeur: true }), 'X')
        === 'La dernière place vient d’être prise. Choisis un autre horaire.')
    const FICHE_E = sansProse(lire('app/commander/rdv/[slug]/page.js'))
    verifie('⚠️ la fiche n’affiche plus aucun message brut de paiement',
      !/Erreur paiement : \$\{e\.message\}/.test(FICHE_E) && !/\(RPC\)/.test(FICHE_E) && !/Reessaie/.test(FICHE_E)
      && (FICHE_E.match(/setSubmitError\(messagePaiementRate\(e, commercant\.nom\)\)/g) || []).length === 2
      && (FICHE_E.match(/throw Object\.assign\(new Error\(j\.error \|\| ''\), \{ duServeur: Boolean\(j\.error\) \}\)/g) || []).length === 2)
  }

  // ── L'ÉCRAN DE CONFIRMATION NE PROMET QUE CE QUI ARRIVERA (Audit 2 C4, Annul-C3)
  {
    const { rappelDeLaVeillePartira } = await import('../lib/timezone.js')
    verifie('🔴 réservé avant le passage du matin de la veille : le rappel partira',
      rappelDeLaVeillePartira('2026-10-06', Date.parse('2026-10-05T06:59:00Z')) === true)
    verifie('🔴 réservé après : il ne partira pas, et l’écran ne le promet plus',
      rappelDeLaVeillePartira('2026-10-06', Date.parse('2026-10-05T07:01:00Z')) === false
      && rappelDeLaVeillePartira('2026-10-06', Date.parse('2026-10-06T05:00:00Z')) === false)
    const { textesConfirmation: textesC, RETRAIT_RDV: RDV_C } = await import('../lib/ecran-retrait.js')
    verifie('⚠️ sans rappel, l’étape renvoie à l’email et à l’agenda',
      !textesC(RDV_C, { rappelVeille: false }).etapes.some(e => /la veille/.test(e))
      && textesC(RDV_C, {}).etapes.some(e => /la veille/.test(e)))
    const FICHE_C = sansProse(lire('app/commander/rdv/[slug]/page.js'))
    verifie('🔴 la fiche dit à l’écran si le rappel partira', /rappelVeille: rappelDeLaVeillePartira\(rdvCree\?\.date_rdv\),/.test(FICHE_C))
    verifie('🔴 et ne promet plus de « reporter » : aucun écran ne le permet au client',
      !/annuler ou reporter|annuler\/reporter/.test(FICHE_C))
  }

  // ── LA PAGE STRIPE SE LIT EN FRANÇAIS (Audit 2 C2, 03/10) ───────────────
  // Ni tiret cadratin, ni date « 2026-10-05 » dans ce que le client lit en payant.
  {
    for (const f of ['create-rdv-acompte', 'create-rdv-commande', 'create-abonnement']) {
      const src = sansProse(lire(`app/api/stripe/checkout/${f}/route.js`))
      const libelles = [...src.matchAll(/(?:name|description): `([^`]*)`/g)].map(m => m[1])
      verifie(`🔴 ${f} : aucun tiret cadratin sur la page de paiement`, libelles.length > 0 && libelles.every(l => !l.includes('—')), libelles.join(' | '))
      verifie(`⚠️ ${f} : aucune date technique sur la page de paiement`, libelles.every(l => !/\$\{date_rdv\}/.test(l)), libelles.join(' | '))
    }
  }

  // ── LES LIENS PROFESSEUR-PRESTATION SE LISENT (Audit 1 I16, 03/10) ──────
  {
    const CONF_L = sansProse(lire('app/dashboard/ConfigDashboard.js'))
    verifie('🔴 l’effacement des liens se lit, et l’insertion ne part que s’il a réussi',
      /const \{ error: errDelJ \} = await supabase\.from\('rdv_prestation_praticiens'\)\.delete\(\)\.eq\('prestation_id', prestationId\)/.test(CONF_L)
      && /if \(!errDelJ && selectedPraticiens\.size > 0\) \{/.test(CONF_L))
    verifie('🔴 et un échec se dit, au lieu de « Prestation mise à jour »',
      /if \(errJ\) \{ liensRates = true;/.test(CONF_L) && /if \(liensRates\) \{\s*toast\(/.test(CONF_L))
  }

  // ── « PAIEMENT SUR PLACE » NE PROMET PLUS CE QU'IL NE FAIT PAS (Audit 1 I13)
  {
    const PAIE = sansProse(lire('app/dashboard/TabPaiements.js'))
    verifie('🔴 l’option ne prétend plus rendre le paiement en ligne obligatoire pour tout',
      !/Désactivé = paiement en ligne obligatoire/.test(PAIE) && /Pour tes commandes : quand c’est activé/.test(PAIE))
    verifie('⚠️ et dit aux commerces de rendez-vous qu’elle ne les concerne pas',
      /\{commercant\.categorie === 'vitrine' && ' Tes rendez-vous ne sont pas concernés/.test(PAIE))
  }

  // ── LE STUDIO APPREND L'ÉCHEC D'UN REMBOURSEMENT (Annul-I1, 03/10) ──────
  {
    const { emailRemboursementEchoue } = await import('../lib/resend.js')
    const html = String(emailRemboursementEchoue({ commercant_nom: 'Centre Respire', client: '<i>Sophie</i>', montant: 15, date_rdv: '2026-10-05', heure_debut: '18:00:00', prestation_nom: 'Hatha' }))
    verifie('🔴 la commerçante lit le montant à rembourser et le geste à faire',
      /15,00/.test(html) && /Rembourse-le depuis ton tableau Stripe/.test(html) && /18:00/.test(html))
    verifie('⚠️ le nom tapé par le client ne devient pas du HTML', !/<i>Sophie<\/i>/.test(html))
    const CANCEL = sansProse(lire('app/api/rdv/cancel/route.js'))
    verifie('🔴 la route l’envoie dès que le remboursement échoue',
      /if \(refundError && commercant\?\.email\) \{[\s\S]{0,300}html: emailRemboursementEchoue\(\{/.test(CANCEL))
  }

  // ── UNE ANNULATION, UN REMBOURSEMENT, UN EMAIL (Annul-I8, 03/10) ────────
  //
  // 🔴 AUCUN VERROU : un double tap, deux onglets, ou le client et le studio à
  // la même minute lançaient deux remboursements (le second « échouait », email
  // orange sur un acompte rendu), deux chaînes de la file, deux emails.
  {
    const { cleRemboursementRdv } = await import('../lib/rdv-annulation-server.js')
    verifie('🔴 la clé de remboursement est la même pour un même rendez-vous, et propre à lui',
      cleRemboursementRdv('r1') === cleRemboursementRdv('r1') && cleRemboursementRdv('r1') !== cleRemboursementRdv('r2'))
    for (const [nom, fichier] of [['le studio', 'app/api/rdv/annuler-commercant/route.js'], ['le client', 'app/api/rdv/cancel/route.js']]) {
      const src = sansProse(lire(fichier))
      verifie(`🔴 ${nom} : un seul remboursement par rendez-vous chez Stripe`,
        /idempotencyKey: cleRemboursementRdv\(rdv\.id\)/.test(src))
      verifie(`🔴 ${nom} : le statut ne s’écrit que s’il n’a pas changé, et le second l’apprend`,
        /\.eq\('id', rdv\.id\)\s*\.eq\('statut', rdv\.statut\)\s*\.select\('id'\)/.test(src)
        && /if \(!ecrit \|\| ecrit\.length === 0\) \{\s*return NextResponse\.json\(\{ ok: true, already_canceled: true/.test(src))
    }
    verifie('⚠️ le tableau de bord ne renvoie pas l’email d’une annulation déjà faite',
      /if \(j\.already_canceled\) return true/.test(sansProse(lire('app/dashboard/page.js'))))
    verifie('⚠️ le Poste équipe non plus',
      /if \(j\.already_canceled\) \{ dire\('Cette réservation était déjà annulée'\); return \}/.test(sansProse(lire('app/equipe/PosteEquipe.js'))))
  }

  // ── UNE PRESTATION RETIRÉE, UNE DATE TROP LOINTAINE (I9, 03/10) ─────────
  //
  // 🔴 LE SERVEUR NE FAISAIT RESPECTER NI L'UNE NI L'AUTRE. `actif` était lu et
  // jamais vérifié, `deleted_at` n'était pas lu, et l'horizon n'existait qu'à
  // l'écran : une fiche restée ouverte ou un acompte posaient un rendez-vous
  // sur un cours retiré, ou dans six mois.
  // ⚠️ DATES CALCULÉES DEPUIS AUJOURD'HUI : un banc daté rougit le jour où sa
  // date passe.
  {
    const { jourBruxelles } = await import('../lib/timezone.js')
    const { jourPlus } = await import('../lib/attente-rdv.js')
    const PROCHE = jourPlus(jourBruxelles(), 7)
    const LOIN = jourPlus(jourBruxelles(), 75)
    const RESA = { commercantId: 'c1', prestationId: 'p1', heureDebut: '10:00' }

    const retiree = baseSimulee({ prestation: { ...PRESTA_SOLO, actif: false } })
    const r1 = await creerReservationRdv(retiree, { ...RESA, dateRdv: PROCHE, champs: {} })
    verifie('🔴 une prestation désactivée ne se réserve plus en ligne, et rien ne s’écrit',
      r1.ok === false && r1.code === 'prestation_inactive' && retiree._vu.payload === null, JSON.stringify(r1))
    const auComptoir = await creerReservationRdv(baseSimulee({ prestation: { ...PRESTA_SOLO, actif: false } }), { ...RESA, dateRdv: PROCHE, champs: { source: 'commercant' } })
    verifie('⚠️ la commerçante, elle, la pose encore dans son agenda', auComptoir.ok === true, JSON.stringify(auComptoir))

    const supprimee = { ...PRESTA_SOLO, deleted_at: '2026-10-01T10:00:00Z' }
    const r2 = await creerReservationRdv(baseSimulee({ prestation: supprimee }), { ...RESA, dateRdv: PROCHE, champs: {} })
    const r3 = await creerReservationRdv(baseSimulee({ prestation: supprimee }), { ...RESA, dateRdv: PROCHE, champs: { source: 'commercant' } })
    verifie('🔴 une prestation supprimée ne se réserve plus, pour personne',
      r2.ok === false && r2.code === 'prestation_introuvable' && r3.ok === false && r3.code === 'prestation_introuvable',
      JSON.stringify([r2, r3]))

    const loin = baseSimulee({ prestation: PRESTA_SOLO })
    const r4 = await creerReservationRdv(loin, { ...RESA, dateRdv: LOIN, champs: {} })
    verifie('🔴 une date au-delà de l’horizon de la fiche est refusée, et rien ne s’écrit',
      r4.ok === false && r4.code === 'hors_horizon' && loin._vu.payload === null, JSON.stringify(r4))
    const sim = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO }), { ...RESA, dateRdv: LOIN, champs: {}, simulation: true })
    verifie('🔴 la vérification avant paiement la refuse aussi', sim.ok === false && sim.code === 'hors_horizon', JSON.stringify(sim))
    const ouvertLoin = baseSimulee({ prestation: PRESTA_SOLO, commercant: { id: 'c1', nom: 'Ciseaux et Soins', adresse: 'Rue du Siège 1', rdv_horizon_jours: 90 } })
    const r5 = await creerReservationRdv(ouvertLoin, { ...RESA, dateRdv: LOIN, champs: {} })
    verifie('⚠️ l’horizon est celui que la commerçante a réglé', r5.ok === true, JSON.stringify(r5))
    const r6 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO }), { ...RESA, dateRdv: LOIN, champs: { source: 'commercant' } })
    verifie('⚠️ et la commerçante pose ses rendez-vous au-delà', r6.ok === true, JSON.stringify(r6))
    const r7 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_SOLO }), { ...RESA, dateRdv: PROCHE, champs: {} })
    verifie('une date proche se réserve', r7.ok === true, JSON.stringify(r7))

    const { estRefusDeRegle: regle, refusAvantPaiement: avant, motifApresPaiement: apres } = await import('../lib/refus-reservation.js')
    verifie('🔴 les deux refus se remboursent après un paiement, sans se rejouer',
      regle('prestation_inactive') && regle('hors_horizon'))
    verifie('🔴 et chacun se dit avant le paiement : l’horizon renvoie à la grille, le retrait non',
      avant({ code: 'hors_horizon' }).corps.creneau_refuse === true
      && avant({ code: 'prestation_inactive' }, { nom: 'Centre Respire' }).corps.error === 'Centre Respire ne propose plus cette prestation en ligne.'
      && !avant({ code: 'prestation_inactive' }).corps.creneau_refuse)
    verifie('⚠️ et après le paiement, avec leur raison',
      apres('prestation_inactive') !== apres('inconnu') && apres('hors_horizon') !== apres('inconnu'))
  }

  // ── LA MÊME PERSONNE DEUX FOIS AU MÊME COURS (Audit 2 I5, Alex 04/10) ───
  //
  // 🔴 RIEN NE L'EMPÊCHAIT : un double clic, un retour arrière après paiement,
  // et la cliente occupait deux places d'un cours. Refus en ligne, par la fiche
  // OU par l'adresse ; le comptoir reste libre.
  {
    const { jourBruxelles } = await import('../lib/timezone.js')
    const { jourPlus } = await import('../lib/attente-rdv.js')
    const JOUR = jourPlus(jourBruxelles(), 5)
    const COURS = { commercantId: 'c1', prestationId: 'p2', dateRdv: JOUR, heureDebut: '18:30' }
    const LEA = { place_no: 1, client_id: null, client_email: 'Lea@Exemple.be ' }

    const parAdresse = baseSimulee({ prestation: PRESTA_COURS, placesPrises: [LEA] })
    const r1 = await creerReservationRdv(parAdresse, { ...COURS, champs: { client_email: 'lea@exemple.be' } })
    verifie('🔴 la même adresse sur la même séance est refusée en ligne, et rien ne s’écrit',
      r1.ok === false && r1.code === 'deja_inscrit' && parAdresse._vu.payload === null, JSON.stringify(r1))
    const r2 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_COURS, placesPrises: [{ place_no: 1, client_id: 'cl-9', client_email: null }] }),
      { ...COURS, champs: { client_id: 'cl-9', client_email: 'autre@exemple.be' } })
    verifie('🔴 et la même fiche aussi, quelle que soit l’adresse saisie', r2.ok === false && r2.code === 'deja_inscrit', JSON.stringify(r2))
    const r3 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_COURS, placesPrises: [LEA] }), { ...COURS, champs: { client_email: 'lea@exemple.be' }, simulation: true })
    verifie('🔴 la vérification avant paiement la refuse aussi', r3.ok === false && r3.code === 'deja_inscrit', JSON.stringify(r3))
    const comptoir = baseSimulee({ prestation: PRESTA_COURS, placesPrises: [LEA] })
    const r4 = await creerReservationRdv(comptoir, { ...COURS, champs: { client_email: 'lea@exemple.be', source: 'commercant' } })
    egal('⚠️ au comptoir, la commerçante inscrit une deuxième personne sous la même adresse', r4.ok === true ? comptoir._vu.payload.place_no : -1, 2)
    const autre = baseSimulee({ prestation: PRESTA_COURS, placesPrises: [LEA] })
    const r5 = await creerReservationRdv(autre, { ...COURS, champs: { client_email: 'tom@exemple.be' } })
    egal('une autre personne prend la place suivante', r5.ok === true ? autre._vu.payload.place_no : -1, 2)
    const r6 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_COURS, placesPrises: [{ place_no: 1, client_id: null, client_email: null }] }), { ...COURS, champs: {} })
    verifie('⚠️ deux absences d’adresse ne désignent pas la même personne', r6.ok === true, JSON.stringify(r6))
    const plein = Array.from({ length: 12 }, (_, i) => (i === 3 ? { ...LEA, place_no: 4 } : { place_no: i + 1, client_id: null, client_email: `p${i}@exemple.be` }))
    const r7 = await creerReservationRdv(baseSimulee({ prestation: PRESTA_COURS, placesPrises: plein }), { ...COURS, champs: { client_email: 'lea@exemple.be' } })
    verifie('⚠️ sur un cours complet, elle apprend qu’elle a déjà sa place, pas que c’est complet', r7.ok === false && r7.code === 'deja_inscrit', JSON.stringify(r7))

    const { estRefusDeRegle: regle, refusAvantPaiement: avant, motifApresPaiement: apres } = await import('../lib/refus-reservation.js')
    const dit = avant({ code: 'deja_inscrit' }, { nom: 'Centre Respire' })
    verifie('🔴 le refus se dit avant le paiement, sans renvoyer à la grille, et nomme le commerce à contacter',
      dit.status === 409 && !dit.corps.creneau_refuse && dit.corps.error === 'Tu as déjà une place à ce cours, à cette heure-là. Pour inscrire une autre personne, contacte Centre Respire.',
      JSON.stringify(dit))
    verifie('🔴 et après un paiement, il se rembourse avec sa raison, sans se rejouer',
      regle('deja_inscrit') && apres('deja_inscrit') !== apres('inconnu'))

    // Les trois routes de paiement passent l'adresse à leur vérification : sans
    // elle, le doublon passerait le contrôle et ne serait refusé qu'au webhook,
    // APRÈS l'encaissement.
    for (const route of ['create-rdv-acompte', 'create-rdv-commande', 'create-rdv-empreinte']) {
      const code = sansProse(lire(`app/api/stripe/checkout/${route}/route.js`))
      const debut = code.indexOf('const essai = await creerReservationRdv(')
      const bloc = debut >= 0 ? code.slice(debut, code.indexOf('simulation: true', debut)) : ''
      verifie(`🔴 ${route} : la vérification avant Stripe reçoit l’adresse`, /\n\s*client_email: emailEssai,\n/.test(bloc) && /const emailEssai = normaliserEmail\(client_email\)\n/.test(code), bloc.slice(0, 200))
    }

    // 🔴 LE REJEU D'UN ACOMPTE NE REMBOURSE PLUS UN RENDEZ-VOUS NÉ. L'acompte
    // n'envoie pas `yoppaa_rdv_id` : chaque rejeu tirait un nouvel identifiant,
    // et la règle de place (ou « déjà inscrit ») remboursait le paiement d'un
    // rendez-vous qui existait. Le paiement est relu AVANT de créer.
    const webhook = sansProse(lire('app/api/stripe/webhook/route.js'))
    const garde = webhook.indexOf(".eq('stripe_payment_intent_id', paymentIntent.id).limit(1)")
    const creation = webhook.indexOf('const rdvId = meta.yoppaa_rdv_id ||')
    verifie('🔴 le webhook de l’acompte relit le paiement avant de créer le rendez-vous', garde > 0 && creation > garde, `${garde} / ${creation}`)
  }

  // ── CE QUE LE MODULE DÉCIDE L'EMPORTE SUR CE QU'ON LUI PASSE ────────────
  {
    const db = baseSimulee({ prestation: PRESTA_COURS, placesPrises: [1, 2] })
    await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-09-07', heureDebut: '18:30',
      champs: { place_no: 1, capacite_creneau: 1, tva_taux: 99 },
    })
    // 🔴 UN APPELANT QUI RECOPIERAIT SA PROPRE PLACE RECRÉERAIT EXACTEMENT la
    // divergence que ce module existe pour tuer.
    egal('un appelant ne peut pas imposer sa place', db._vu.payload.place_no, 3)
    egal('ni sa capacité', db._vu.payload.capacite_creneau, 12)
    egal('ni son taux de TVA', db._vu.payload.tva_taux, 6)
  }

  // ── LA PRESTATION D'UN AUTRE COMMERCE EST REFUSÉE ───────────────────────
  {
    const db = baseSimulee({ prestation: { ...PRESTA_SOLO, commercant_id: 'AUTRE' } })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p1',
      dateRdv: '2026-09-07', heureDebut: '10:00', champs: {},
    })
    // 🔴 CROISER DEUX IDENTIFIANTS SANS VÉRIFIER LEUR LIEN laisserait réserver
    // la prestation d'un salon dans l'agenda d'un autre.
    verifie('une prestation d’un autre commerce est refusée',
      res.ok === false && res.code === 'prestation_hors_commerce')
    verifie('et rien n’est écrit', db._vu.payload === null)
  }
  {
    const db = baseSimulee({ prestation: null })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'inconnue',
      dateRdv: '2026-09-07', heureDebut: '10:00', champs: {},
    })
    verifie('une prestation introuvable est refusée',
      res.ok === false && res.code === 'prestation_introuvable')
  }

  // ── UN CRÉNEAU N'ACCEPTE QUE LES PRESTATIONS QU'IL A ACCEPTÉES (07/09) ───
  //
  // 🔴 LE DÉFAUT D'ORIGINE, TROUVÉ PAR ALEX. Un créneau ne disait rien des
  // prestations : le cours de yoga de Centre Respire était donc proposé à
  // toutes les heures de tous les jours, et une personne réservant un Reiki à
  // 10h annulait de fait le cours de 10h. L'écran filtre désormais, mais un
  // écran ne décide de rien : c'est ici que ça se refuse.
  {
    // Lundi 10:00-11:00 réservé au yoga ; lundi 08:00-18:00 pour le reste.
    const CRENEAUX = [
      { id: 'k-yoga', jour_semaine: 'lundi', date_specifique: null, heure_debut: '10:00:00', heure_fin: '11:00:00', actif: true },
      { id: 'k-libre', jour_semaine: 'lundi', date_specifique: null, heure_debut: '08:00:00', heure_fin: '18:00:00', actif: true },
    ]
    const LIAISONS = [{ creneau_id: 'k-yoga', prestation_id: 'p2' }]

    {
      const db = baseSimulee({ prestation: PRESTA_COURS, creneaux: CRENEAUX, liaisons: LIAISONS })
      const res = await creerReservationRdv(db, {
        commercantId: 'c1', prestationId: 'p2',
        dateRdv: '2026-09-07', heureDebut: '10:00', champs: {},
      })
      verifie('le cours passe à l’heure de SON créneau', res.ok === true)
    }
    {
      // 🔴 LA GARDE QUI COMPTE. 13h est bien dans un créneau du lundi, mais pas
      // dans un créneau QUI ACCEPTE le yoga. Sans le contrôle de l'heure, ce
      // rendez-vous passerait et le commerçant devrait l'assurer.
      const db = baseSimulee({ prestation: PRESTA_COURS, creneaux: CRENEAUX, liaisons: LIAISONS })
      const res = await creerReservationRdv(db, {
        commercantId: 'c1', prestationId: 'p2',
        dateRdv: '2026-09-07', heureDebut: '13:00', champs: {},
      })
      verifie('🔴 le cours est refusé HORS de son créneau',
        res.ok === false && res.code === 'prestation_hors_creneau')
      verifie('et rien n’est écrit', db._vu.payload === null)
    }
    {
      // ⚠️ SON AGENDA RESTE LE SIEN. Le commerçant a toujours pu poser un
      // rendez-vous hors de ses horaires, typiquement pour un client qui
      // appelle. Lui refuser ferait de cette correction une régression sur le
      // geste qu'il fait le plus souvent.
      const db = baseSimulee({ prestation: PRESTA_COURS, creneaux: CRENEAUX, liaisons: LIAISONS })
      const res = await creerReservationRdv(db, {
        commercantId: 'c1', prestationId: 'p2',
        dateRdv: '2026-09-07', heureDebut: '13:00', champs: { source: 'commercant' },
      })
      verifie('⚠️ la saisie du commerçant passe quand même', res.ok === true)
    }
    {
      // ⚠️ ET UN COMMERCE QUI N'A RIEN RÉGLÉ NE CHANGE PAS DE COMPORTEMENT.
      // C'est la garantie de non-régression pour tout le parc.
      const db = baseSimulee({ prestation: PRESTA_COURS, creneaux: CRENEAUX, liaisons: [] })
      const res = await creerReservationRdv(db, {
        commercantId: 'c1', prestationId: 'p2',
        dateRdv: '2026-09-07', heureDebut: '13:00', champs: {},
      })
      verifie('⚠️ sans aucune liaison, tout passe comme avant', res.ok === true)
    }
    {
      // Le Reiki, lui, n'est visé par aucune liaison : le créneau large
      // l'accepte, celui du yoga non. Il passe donc à 13h, pas à 10h.
      const db = baseSimulee({ prestation: PRESTA_SOLO, creneaux: CRENEAUX, liaisons: LIAISONS })
      const res = await creerReservationRdv(db, {
        commercantId: 'c1', prestationId: 'p1',
        dateRdv: '2026-09-07', heureDebut: '13:00', champs: {},
      })
      verifie('une prestation non visée garde les créneaux libres', res.ok === true)
    }
  }

  // ── LE DOUBLE-BOOKING EST NOMMÉ, PAS AVALÉ ──────────────────────────────
  {
    const db = baseSimulee({ prestation: PRESTA_COURS, placesPrises: [1], erreurInsert: { code: '23505' } })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-09-07', heureDebut: '18:30', champs: {},
    })
    // ⚠️ « COLLECTIF » CHANGE LA PHRASE MONTRÉE : sur un cours de douze, « ce
    // créneau vient d'être pris » laisserait croire que le cours est annulé.
    verifie('un doublon rend « place_prise » et dit que c’est un cours',
      res.ok === false && res.code === 'place_prise' && res.collectif === true)
  }
  {
    const db = baseSimulee({ prestation: PRESTA_SOLO, erreurInsert: { code: '23P01' } })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p1',
      dateRdv: '2026-09-07', heureDebut: '10:00', champs: {},
    })
    verifie('un chevauchement de praticien aussi, sans parler de cours',
      res.ok === false && res.code === 'place_prise' && res.collectif === false)
  }
  {
    const db = baseSimulee({ prestation: PRESTA_SOLO, erreurInsert: { code: '42P01', message: 'table absente' } })
    const res = await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p1',
      dateRdv: '2026-09-07', heureDebut: '10:00', champs: {},
    })
    // ⚠️ UNE PANNE N'EST PAS UN CRÉNEAU PRIS. Les confondre enverrait le client
    // choisir un autre horaire devant un agenda parfaitement libre.
    verifie('et toute autre erreur reste une panne, pas un créneau pris',
      res.ok === false && res.code === 'ecriture_impossible')
  }
}

// ═══ 5 ter) LA ROUTE SANS PAIEMENT, ET SA GARDE ═══════════════════════════
{
  const src = lireCode('app/api/rdv/reserver/route.js')
  // 🔴 LA GARDE QUI FAIT TENIR TOUT LE RESTE : si un acompte encaissable
  // subsiste, cette route n'est pas le bon chemin, et l'accepter ferait perdre
  // son acompte au commerçant en silence.
  verifie('un acompte encaissable renvoie vers le paiement',
    /if \(vent\.acompte >= MINIMUM_STRIPE\)/.test(src) && /paiement_requis: true/.test(src))
  // ⚠️ ET LE SEUIL EST LE MINIMUM STRIPE, pas zéro : entre 0 et 0,50 € il n'y a
  // aucun paiement possible, donc ce chemin-ci est le bon.
  verifie('et le seuil est bien le minimum encaissable', /MINIMUM_STRIPE = 0\.5/.test(src))
  // 🔴 LE FORFAIT ET L'INTERRUPTEUR, qui n'étaient vérifiés NULLE PART sur ce
  // chemin tant qu'il vivait dans le navigateur.
  verifie('le forfait du commerçant est vérifié', /verdictForfait\(commercant, 'rdv'\)/.test(src))
  verifie('et son interrupteur d’agenda aussi', /if \(!commercant\.rdv_actif\)/.test(src))
  // ⚠️ `paiement_ligne` N'EST PAS EXIGÉ ICI, et c'est volontaire : il n'y a rien
  // à encaisser. L'exiger fermerait la réservation gratuite chez qui ne l'a pas.
  verifie('mais pas la fonction de paiement, inutile ici',
    !/verdictForfait\(commercant, 'paiement_ligne'\)/.test(src))
  // ⚠️ L'IDENTITÉ PROUVÉE POUR LA RÉCOMPENSE, jamais `client_email` : il est
  // envoyé par le client et ne prouve rien.
  verifie('la récompense exige une identité prouvée',
    /const identite = await identiteProuvee\(request\)/.test(src)
    && /recompense_refusee: 'non_connecte'/.test(src))
  // ⚠️ « L'ÉCRAN CALCULE, LE SERVEUR DÉCIDE » : les bons sont rechargés EN BASE,
  // et depuis le 01/09 par le module partagé, qui en accepte jusqu'à cinq.
  verifie('et les bons sont rechargés en base',
    /await chargerBonsValides\(db, \{/.test(src) && /soldeBon: soldeBonTotal/.test(src))
  // ⚠️ LE CRÉNEAU EST REVÉRIFIÉ CÔTÉ SERVEUR : passé, jour de fermeture, pause.
  // ⚠️ L'HEURE MURALE BELGE, jamais l'horloge du serveur : Vercel tourne en
  // temps universel, et un rendez-vous d'hier matin passerait.
  // ⚠️ PRÉCISÉE LE 10/09 TARD : la garde est devenue UNE fonction, à l'heure
  // belge, appelée par les quatre portes. Elle est EXÉCUTÉE dans la section
  // « Aucune porte n'accepte un créneau passé », été comme hiver.
  verifie('un créneau déjà passé est refusé',
    /if \(creneauDejaCommence\(date_rdv, heure\)\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'Ce créneau est déjà passé\. Choisis-en un autre\.', creneau_refuse: true \}, \{ status: 409 \}\)/.test(src))
  verifie('un jour de fermeture aussi', /est fermé ce jour-là/.test(src))
  verifie('et une pause aussi', /tombe pendant une pause/.test(src))
  // 🔴 LA FICHE CLIENT EST RÉSOLUE, PAS REÇUE. Un `client_id` fourni par
  // l'appelant rattacherait le rendez-vous à la fiche de n'importe qui.
  verifie('la fiche client se retrouve par l’email, jamais par un identifiant reçu',
    !/client_id[,:]/.test(src.split('const {')[1]?.split('} = body')[0] || '')
    && /from\('clients'\)\.select\('id'\)\.eq\('email', email\)/.test(src))
  // ⚠️ APRÈS L'INSERT, comme partout : les deux mouvements DÉSIGNENT le
  // rendez-vous, ils ne peuvent pas le précéder.
  const posCreation = src.indexOf('creerReservationRdv(db, {')
  const posAvantages = src.indexOf('appliquerAvantagesRdv(db, {')
  verifie('les avantages s’appliquent APRÈS la création',
    posCreation > 0 && posAvantages > posCreation, `création ${posCreation}, avantages ${posAvantages}`)
}

// ═══ 6) L'EMAIL D'ANNULATION DIT L'ARGENT ═════════════════════════════════
{
  // 🔴 IL NE PARLAIT QUE DE L'ACOMPTE. Sur un rendez-vous payé par bon,
  // l'acompte vaut zéro : le bloc entier disparaissait et Alex a reçu une
  // annulation SANS UN SEUL MONTANT.
  const html = emailRdvAnnule({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins', commercant_slug: 'ciseaux',
    prestation_nom: 'Coupe femme', date_rdv: '2026-08-31', heure_debut: '11:30',
    acompte_paye: false, acompte_montant: 0, refund_en_cours: true, raison_annulation: 'yopper',
    refund_montant: 43.80, bon_rendu: 35, produits_gardes: false,
  })
  verifie('l’email annonce ce qui revient sur la carte', html.includes('43,80'))
  verifie('l’email annonce le bon recrédité', html.includes('35,00') && /bon cadeau/i.test(html))
  verifie('et il le dit utilisable tout de suite', /dès maintenant/i.test(html))
  // ⚠️ UN SEUL BON RESTE AU SINGULIER : « tes bons » devant un seul est aussi
  // faux que l'inverse.
  verifie('un seul bon reste au singulier', /sur ton bon cadeau/.test(html) && !/tes bons/.test(html))

  // 🔴 ET LA PHRASE SE MET AU PLURIEL (01/09). Un rendez-vous peut être couvert
  // par cinq bons : « sur ton bon cadeau » en annonce un, le Yopper en cherche
  // un, et croit avoir perdu les autres.
  const troisBons = emailRdvAnnule({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins', commercant_slug: 'ciseaux',
    prestation_nom: 'Coupe femme', date_rdv: '2026-08-31', heure_debut: '11:30',
    acompte_paye: false, acompte_montant: 0, refund_en_cours: true, raison_annulation: 'yopper',
    refund_montant: 0, bon_rendu: 145, nb_bons: 3,
  })
  verifie('🔴 trois bons recrédités se disent au PLURIEL',
    /sur tes bons cadeaux/.test(troisBons), troisBons.slice(0, 0))
  verifie('et le montant annoncé est la SOMME des trois', troisBons.includes('145,00'))

  // Le client garde ses produits : on lui dit qu'ils l'attendent.
  const garde = emailRdvAnnule({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins', commercant_slug: 'ciseaux',
    prestation_nom: 'Coupe femme', date_rdv: '2026-08-31', heure_debut: '11:30',
    acompte_paye: true, acompte_montant: 8.75, refund_en_cours: true, raison_annulation: 'yopper',
    refund_montant: 8.75, bon_rendu: 0, produits_gardes: true, produits_montant: 43.80,
  })
  verifie('les produits gardés sont annoncés', /attendent en boutique/i.test(garde))
  verifie('et leur montant est dit', garde.includes('43,80'))

  // ⚠️ ET RIEN NE S'INVENTE : un rendez-vous sans argent n'affiche aucun bloc.
  const vide = emailRdvAnnule({
    yopper_prenom: 'Alexandre', commercant_nom: 'X', commercant_slug: 'x',
    prestation_nom: 'Coupe', date_rdv: '2026-08-31', heure_debut: '11:30',
    acompte_paye: false, acompte_montant: 0, raison_annulation: 'yopper',
  })
  verifie('sans argent, aucun bloc de montant', !/Ce qui te revient/.test(vide))
  // ⚠️ ET LE FORMAT RESTE BELGE, virgule et espace insécable.
  verifie('aucun montant au point dans l’email', !/\d+\.\d{2}\s*€/.test(html))
}
{
  const src = lireCode('app/api/emails/rdv-annule/route.js')
  verifie('la route email relaie les montants', /bon_rendu/.test(src) && /refund_montant/.test(src))
}

// ═══ 7) LA COMPTABILITÉ VOIT LE BON SUR UN RENDEZ-VOUS ════════════════════
{
  // 🔴 ON EXÉCUTE LE JOURNAL, on ne cherche pas un mot dedans. Ma première
  // version testait la présence de `parBonRdv` : neutraliser le `if` laissait
  // le nom en place et la garde verte. Le harnais de mutation l'a dit.
  //
  // LE CAS D'ALEX : une coupe de 35 € entièrement réglée par un bon cadeau,
  // sans acompte. Elle ne figurait dans AUCUN document comptable.
  const rdvBon = {
    id: 'r1', statut: 'honore', date_rdv: '2026-08-31', prix_estime: 35,
    acompte_montant: 0, acompte_paye: false, bon_cadeau_montant: 35,
    tva_taux: 21, client_prenom: 'Alexandre', client_nom: 'V', numero_rdv: 1,
  }
  const lignes = construireLignes({ rdvs: [rdvBon], tauxDefaut: 21 })
  const ligneBon = lignes.find(l => l.type === 'Bon cadeau RDV')
  verifie('un rendez-vous payé par bon PRODUIT une ligne comptable', !!ligneBon)
  if (ligneBon) {
    egal('elle porte le montant du bon', ligneBon.bonCadeau, 35)
    egal('et son total', ligneBon.total, 35)
    // ⚠️ NI EN LIGNE NI COMPTOIR : l'argent est entré à l'achat du bon, et le
    // compter une seconde fois doublerait le chiffre d'affaires.
    egal('rien n’est compté en ligne', ligneBon.enLigne, 0)
    egal('rien n’est compté au comptoir', ligneBon.comptoir, 0)
    egal('et rien ne reste à encaisser', ligneBon.resteAEncaisser, 0)
    egal('Stripe n’a rien vu passer', ligneBon.fraisStripe, 0)
    // ⚠️ LA TVA SUIT LE TAUX DU RENDEZ-VOUS, sinon le journal ventile faux.
    verifie('la ligne est ventilée au bon taux', Object.keys(ligneBon.parTaux || {}).length === 1)
  }
  // ⚠️ ET RIEN NE S'INVENTE : sans bon, aucune ligne de ce type.
  const sansBon = construireLignes({
    rdvs: [{ ...rdvBon, bon_cadeau_montant: 0 }], tauxDefaut: 21,
  })
  verifie('sans bon, aucune ligne « Bon cadeau RDV »',
    !sansBon.some(l => l.type === 'Bon cadeau RDV'))
}
{
  const src = lireCode('app/api/dashboard/export-comptable/route.js')
  // ⚠️ LA COLONNE DOIT ARRIVER JUSQU'AU MODULE, sinon la ligne ne s'écrit
  // jamais et personne ne le sait.
  const selectRdv = src.slice(src.indexOf('numero_rdv'), src.indexOf('numero_rdv') + 400)
  verifie('la route charge bon_cadeau_montant sur les rendez-vous',
    /bon_cadeau_montant/.test(selectRdv))
}
{
  const src = lireCode('app/api/rdv/mes-rdvs/route.js')
  verifie('le suivi Yopper charge les deux colonnes d’avantage',
    /fidelite_remise/.test(src) && /bon_cadeau_montant/.test(src))
}

// ═══ 8bis) LE RÉCAPITULATIF DIT CE QUI EST DÉDUIT ═════════════════════════
{
  const src = lireCode('app/commander/rdv/[slug]/page.js')
  // 🔴 IL SE TAISAIT (Alex, 30/08) : « les infos de ce qui est déduit sont
  // inexistantes aux yeux du client, du coup il ne comprend rien ». Il listait
  // la prestation à son prix plein, les produits, puis un acompte sans lien
  // visible avec quoi que ce soit.
  const recap = src.slice(src.indexOf('Ton récapitulatif'), src.indexOf('Solde à régler sur place') + 400)
  // ⚠️ ON MESURE LA CONDITION QUI DÉCIDE DE L'AFFICHAGE, pas le libellé
  // affiché : neutraliser le `if` laissait le texte en place, donc la garde
  // verte. Troisième fois de la journée que je vise un mot au lieu d'une
  // règle, et les trois fois c'est le harnais de mutation qui me l'a dit.
  verifie('la ligne de récompense est bien conditionnée à son montant',
    /\{remiseFid > 0 && \([\s\S]{0,600}Ta récompense fidélité/.test(recap))
  // ⚠️ ET LE LIBELLÉ QUI SUIT LA CONDITION NE SE CHERCHE PLUS EN DUR : il porte
  // le mot du métier depuis le 31/08, donc on vise la VARIABLE qui le rend.
  // C'est la quatrième garde de la journée à avoir rougi pour un mot qui a
  // changé alors que la règle, elle, tenait toujours.
  verifie('la ligne de bon cadeau est bien conditionnée à son montant',
    // ⚠️ `Ton {nomBon}` et non `Ton ${nomBon}` : cette ligne-ci est du JSX, pas
    // un gabarit de chaîne. Ma première écriture cherchait le dollar et rendait
    // la garde définitivement rouge, ce qui est le bon échec : elle a dit non.
    /\{remiseBon > 0 && \([\s\S]{0,600}Ton \{nomBon\}/.test(recap))
  // ⚠️ ET L'ASSIETTE DE L'ACOMPTE EST DITE quand elle n'est plus le prix
  // affiché : « 50 % » d'une prestation à 60 € qui donne 5 € a l'air faux.
  verifie('l’assiette de l’acompte est nommée quand elle change',
    /de \$\{euros\(prixNet\)\}/.test(recap))
  // ⚠️ ET LE TOTAL ÉCONOMISÉ, en une ligne, sans faire soustraire le client.
  verifie('le total économisé est annoncé', /Tu économises/.test(src))
  // ⚠️ FORMAT BELGE : virgule et espace insécable, jamais « 26.90€ ».
  verifie('plus aucun montant au point dans le récapitulatif',
    !/aPayerMaintenant\.toFixed\(2\)/.test(src) && !/acompteMnt\.toFixed\(2\)/.test(src))
}

// ═══ 8) PLUS AUCUN STATUT TECHNIQUE À L'ÉCRAN ═════════════════════════════
{
  const src = lireCode('app/commander/page.js')
  // 🔴 « confirme » S'AFFICHAIT EN TOUTES LETTRES dans l'historique : le
  // `statutMap` n'avait pas d'entrée pour lui, et le repli montrait la valeur
  // brute de la base. Trois fois dans la capture d'Alex.
  verifie('l’historique nomme le statut « confirme »', /confirme:\s*\{ label:/.test(src))
  verifie('et le repli ne montre plus la valeur brute',
    !/\|\| \{ label: r\.statut,/.test(src))
  // ⚠️ ET LE PRIX AFFICHÉ EST LE NET CLIENT, pas le tarif plein.
  verifie('le suivi affiche le net client', /montantNetRdv\(r\)/.test(src))
  verifie('et plus le prix brut arrondi', !/Number\(r\.prix_estime\)\.toFixed\(0\)/.test(src))
}

// ═══ 9) CE QUI REVIENT SE MESURE EN L'EXÉCUTANT ═══════════════════════════
//
// 🔴 LE DÉFAUT DU 30/08 AU SOIR, VU PAR ALEX SUR SON PROPRE EMAIL : annulation
// par le commerçant, le bon de 40 € annoncé, les 10 € de récompense passés sous
// silence. Le même email, envoyé par l'autre route, disait les deux.
//
// ⚠️ LA CAUSE ÉTAIT UNE CONFUSION DE GARDES. La fonction ne comptait un retour
// que si c'était ELLE qui l'avait fait : `utilisee_at` non nul, `deja_recredite`
// faux. Ces drapeaux répondent à « est-ce moi qui viens d'agir ». La question du
// Yopper est « est-ce que je récupère mon argent ».
//
// ⚠️ ET ELLE VIVAIT EN DEUX EXEMPLAIRES, un par route. Les trois corrections des
// trois derniers jours n'en ont touché qu'un à chaque fois. Elle vit maintenant
// dans un module, et ON L'EXÉCUTE : une garde qui cherche un mot dans un fichier
// de route n'aurait jamais vu la différence.
{
  const { rendreAvantagesRdv, lignesBonsDe } = await import('../lib/rdv-annulation-server.js')

  // Une base qui répond ce qu'on lui dit, et qui GARDE ce qu'on lui écrit.
  function baseAvantages({ recompense = null, mouvementEnDoublon = false }) {
    const vu = { mouvements: [], recompenseRendue: false }
    const table = (nom) => {
      let patch = null
      const chaine = {
        select: () => chaine,
        eq: () => chaine,
        is: () => chaine,
        not: () => chaine,
        insert: (ligne) => {
          if (nom === 'bons_cadeaux_mouvements' && mouvementEnDoublon) {
            return Promise.resolve({ error: { code: '23505' } })
          }
          vu.mouvements.push({ table: nom, ...ligne })
          return Promise.resolve({ error: null })
        },
        update: (p) => { patch = p; return chaine },
        maybeSingle: () => {
          if (nom === 'fidelite_recompenses') {
            // L'UPDATE de `rendreRecompense` repasse par ici : il ne rend une
            // ligne que s'il y avait effectivement quelque chose à rendre.
            if (patch) {
              if (!recompense?.utilisee_at) return Promise.resolve({ data: null })
              vu.recompenseRendue = true
              return Promise.resolve({ data: { id: recompense.id } })
            }
            return Promise.resolve({ data: recompense })
          }
          if (nom === 'fidelite_cartes') return Promise.resolve({ data: { recompenses_disponibles: 2 } })
          return Promise.resolve({ data: null })
        },
        single: () => Promise.resolve({ data: { solde: 10, montant_initial: 75 } }),
        then: (suite) => Promise.resolve({ error: null }).then(suite),
      }
      return chaine
    }
    return { from: table, _vu: vu }
  }

  // ── LE CAS ORDINAIRE : les deux reviennent, les deux se disent ──────────
  {
    const db = baseAvantages({ recompense: { id: 'r1', carte_id: 'ca1', utilisee_at: '2026-08-30T15:00:00Z' } })
    const rendu = await rendreAvantagesRdv(db, {
      bonsUtilises: [{ id: 'b1', montant: 40 }], recompenseId: 'r1', recompenseMontant: 10,
      refs: { rdv_id: 'rdv1' },
    })
    egal('le bon recrédité est annoncé', rendu.bon, 40)
    egal('et la récompense aussi', rendu.recompense, 10)
    verifie('la récompense a bien été rendue', db._vu.recompenseRendue === true)
    const mvt = db._vu.mouvements.find(m => m.table === 'bons_cadeaux_mouvements')
    verifie('le mouvement du bon désigne le rendez-vous',
      mvt?.rdv_id === 'rdv1' && mvt?.montant === 40, JSON.stringify(mvt))
  }

  // ── 🔴 LE DÉFAUT D'ALEX : QUELQU'UN EST PASSÉ AVANT NOUS ────────────────
  //
  // Le webhook `charge.refunded` fait les mêmes gestes en secours. S'il arrive
  // le premier, la récompense est déjà libre et le mouvement du bon existe
  // déjà. L'argent EST revenu. Se taire, c'est laisser croire qu'il est perdu.
  {
    const db = baseAvantages({
      recompense: { id: 'r1', carte_id: 'ca1', utilisee_at: null },
      mouvementEnDoublon: true,
    })
    // ⚠️ ON INTERCEPTE L'ALERTE ET ON LA MESURE, au lieu de la laisser salir la
    // sortie du banc. Une récompense déjà libre est VRAIE pour le client et
    // ANORMALE pour nous : si personne ne crie, ce cas-là reste invisible des
    // semaines, ce qui est exactement ce qui vient de se passer.
    const warnOriginal = console.warn
    const cris = []
    console.warn = (...a) => cris.push(a.join(' '))
    let rendu
    try {
      rendu = await rendreAvantagesRdv(db, {
        bonsUtilises: [{ id: 'b1', montant: 40 }], recompenseId: 'r1', recompenseMontant: 10,
        refs: { rdv_id: 'rdv1' },
      })
    } finally {
      console.warn = warnOriginal
    }
    egal('un bon déjà recrédité s’annonce quand même', rendu.bon, 40)
    egal('une récompense déjà libre s’annonce quand même', rendu.recompense, 10)
    // ⚠️ ET ON NE LA REND PAS UNE SECONDE FOIS : le compteur de la carte
    // monterait d'un cran à chaque passage.
    verifie('mais on ne la rend pas deux fois', db._vu.recompenseRendue === false)
    verifie('et l’anomalie est criée dans les journaux',
      cris.some(c => /déjà libre/.test(c)), cris.join(' | '))
  }

  // ── CE QUI N'EXISTE PAS NE S'ANNONCE PAS ────────────────────────────────
  {
    const db = baseAvantages({ recompense: null })
    const rendu = await rendreAvantagesRdv(db, {
      bonsUtilises: [], recompenseId: 'inconnue', recompenseMontant: 10,
      refs: { rdv_id: 'rdv1' },
    })
    egal('une récompense introuvable n’annonce rien', rendu.recompense, 0)
    egal('et sans bon, rien non plus', rendu.bon, 0)
    verifie('aucun mouvement écrit', db._vu.mouvements.length === 0)
  }
  {
    const db = baseAvantages({ recompense: { id: 'r1', carte_id: 'ca1', utilisee_at: 'x' } })
    const rendu = await rendreAvantagesRdv(db, {
      bonsUtilises: [{ id: 'b1', montant: 0 }], recompenseId: null, refs: { rdv_id: 'rdv1' },
    })
    egal('un bon à zéro ne s’annonce pas', rendu.bon, 0)
    egal('et une récompense non demandée non plus', rendu.recompense, 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 PLUSIEURS BONS SUR UN MÊME RENDEZ-VOUS (01/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Ce module recréditait UN bon avec le montant TOTAL. Sur trois bons ayant
  // financé 145 €, cela aurait remis 145 € sur le premier et RIEN sur les deux
  // autres : de l'argent créé d'un côté, détruit de l'autre, sur un instrument
  // au porteur que le Yopper détient encore.
  {
    const db = baseAvantages({ recompense: null })
    const rendu = await rendreAvantagesRdv(db, {
      bonsUtilises: [{ id: 'b1', montant: 50 }, { id: 'b2', montant: 75 }, { id: 'b3', montant: 20 }],
      refs: { rdv_id: 'rdv1' },
    })
    egal('🔴 trois bons : la somme des trois est annoncée', rendu.bon, 145)
    const mvts = db._vu.mouvements.filter(m => m.table === 'bons_cadeaux_mouvements')
    egal('🔴 trois bons : TROIS mouvements, un par bon', mvts.length, 3)
    verifie('🔴 trois bons : chacun reçoit SON montant, pas le total',
      mvts.map(m => `${m.bon_id}:${m.montant}`).sort().join(' ') === 'b1:50 b2:75 b3:20',
      mvts.map(m => `${m.bon_id}:${m.montant}`).join(' '))
    verifie('trois bons : les trois mouvements désignent le rendez-vous',
      mvts.every(m => m.rdv_id === 'rdv1'))
  }
  // ⚠️ ET LE REPLI SUR L'ANCIENNE PAIRE, exécuté : des rendez-vous écrits avant
  // ce déploiement n'ont que `bon_cadeau_id` et `bon_cadeau_montant`. Les
  // ignorer, ce serait le défaut du 29/08 sur toutes les lignes existantes.
  {
    egal('un rendez-vous d’avant garde son bon',
      lignesBonsDe({ bons_utilises: [], bon_cadeau_id: 'vieux', bon_cadeau_montant: 40 }).length, 1)
    // ⚠️ `?.` ET NON `[0].` : sans lui, la mutation qui retire le repli fait
    // PLANTER le banc au lieu de le faire ROUGIR.
    egal('et son montant',
      lignesBonsDe({ bons_utilises: [], bon_cadeau_id: 'vieux', bon_cadeau_montant: 40 })[0]?.montant, 40)
    // 🔴 MAIS LA LISTE FAIT FOI DÈS QU'ELLE EXISTE : lire les deux additionnerait
    // le premier bon deux fois.
    egal('dès que la liste existe, elle seule compte',
      lignesBonsDe({ bons_utilises: [{ id: 'a', montant: 10 }, { id: 'b', montant: 5 }], bon_cadeau_id: 'a', bon_cadeau_montant: 15 }).length, 2)
    egal('un rendez-vous sans aucun bon ne rend rien',
      lignesBonsDe({ bons_utilises: [], bon_cadeau_id: null, bon_cadeau_montant: 0 }).length, 0)
    // ⚠️ UN MONTANT NUL SUR L'ANCIENNE PAIRE N'EST PAS UN BON : écrire un
    // mouvement à zéro salirait l'historique du bon pour rien.
    egal('un montant nul n’est pas un repli',
      lignesBonsDe({ bons_utilises: [], bon_cadeau_id: 'x', bon_cadeau_montant: 0 }).length, 0)
  }
}
{
  // ⚠️ ET LES DEUX ROUTES DÉLÈGUENT, ELLES NE RECOPIENT PLUS. C'est la copie
  // qui a fabriqué les trois défauts : une garde qui vérifierait le contenu
  // dans chaque route accepterait qu'il en existe deux versions.
  for (const chemin of ['app/api/rdv/cancel/route.js', 'app/api/rdv/annuler-commercant/route.js']) {
    const src = lireCode(chemin)
    const court = chemin.split('/').slice(-2)[0]
    verifie(`${court} : délègue le retour des avantages au module`,
      /rendreAvantagesRdv\(supabase, \{/.test(src))
    verifie(`${court} : n’en garde aucune copie locale`,
      !/const rendreAvantages = async/.test(src))
    // 🔴 ET LE STOCK DES VERSIONS REVIENT, comme sur les trois autres sorties.
    verifie(`${court} : rend le stock des versions`,
      /restaurerStockVariantes\(supabase, \[/.test(src))
    // ⚠️ SUR UNE BASCULE RÉELLE SEULEMENT : `restaurerStockVariantes` n'est pas
    // idempotente, c'est à l'appelant de ne l'appeler qu'une fois.
    verifie(`${court} : et seulement si la commande a vraiment basculé`,
      /\.neq\('statut', 'annulee_client_refund'\)/.test(src))
    // ⚠️ ET JAMAIS DEUX FOIS LA MÊME LIGNE DE RÉCOMPENSE. Tant qu'on ne
    // comptait que ce qu'on rendait soi-même, la seconde passe se taisait
    // d'elle-même. Depuis qu'on annonce l'ÉTAT, il faut l'écrire.
    verifie(`${court} : ne compte jamais deux fois la même récompense`,
      /memeRecompense \? null :/.test(src))
    // 🔴 ET L'ORDRE SUPPRIME LA COURSE QUI A PRODUIT LE DÉFAUT. Créer le
    // remboursement réveille le webhook `charge.refunded`, qui recrédite le bon
    // et rend la récompense EN SECOURS. Le 30/08 il s'est glissé entre notre
    // re-crédit et notre relecture : la récompense était déjà libre, et l'email
    // n'en a rien dit. On agit donc AVANT de rembourser.
    //
    // ⚠️ ET CE N'EST PAS QUE DU CONFORT : sans cet ordre, l'alerte
    // « récompense déjà libre » se déclencherait à chaque annulation
    // remboursée, et une alerte qui crie en régime normal n'est plus lue.
    const posRendu = src.indexOf('rendreAvantagesRdv(supabase, {')
    const posRefund = src.indexOf('stripe.refunds.create(')
    verifie(`${court} : les avantages reviennent AVANT le remboursement`,
      posRendu > 0 && posRefund > 0 && posRendu < posRefund,
      `avantages ${posRendu}, remboursement ${posRefund}`)
  }
}
{
  // ⚠️ « TON ACOMPTE BAISSE D'AUTANT » APPARTIENT AU BON, PAS À LA RÉCOMPENSE.
  // Le bon PAIE, euro pour euro. La récompense REMISE : elle baisse le prix, et
  // l'acompte se recalcule dessus. Dire « d'autant » des deux serait faux d'un
  // côté, et c'était le cas depuis toujours.
  const ecran = lireCode('app/commander/rdv/[slug]/page.js')
  const blocRecompense = (ecran.match(/recompenseFid\.libelle[\s\S]{0,400}/) || [''])[0]
  verifie('la récompense ne promet plus une baisse « d’autant »',
    !/acompte baisse d’autant/.test(blocRecompense), blocRecompense.slice(0, 200))
  verifie('elle dit que l’acompte se calcule sur ce qui reste',
    /acompte se calcule sur ce qui reste/.test(blocRecompense))
  // ⚠️ ET LE BON, LUI, LE DIT : c'est vrai à la lettre depuis le 30/08 au soir.
  verifie('le bon annonce la baisse de l’acompte', /Ton acompte baisse d’autant/.test(ecran))
  // ⚠️ RÉANCRÉE LE 01/09 : la phrase parlait d'UN bon (« il couvre déjà ton
  // acompte »). Avec plusieurs, ce n'est plus « il » qui couvre, c'est
  // l'ensemble — et la ventilation qui décide porte sur le TOTAL, pas sur un
  // bon isolé. La règle défendue est la même : un acompte ramené à zéro se DIT,
  // au lieu de laisser un zéro sans explication.
  verifie('et dit quand il l’efface entièrement',
    /Ton acompte est déjà couvert/.test(ecran) && /vent\.acompte === 0/.test(ecran))
}

// ═══ 10) LE COMMERÇANT LIT CE QU'IL DÉCLENCHE ═════════════════════════════
//
// 🔴 « QUAND LE COMMERÇANT ANNULE LE RDV, RIEN NE LUI DIT ET DEMANDE CE QU'IL
// FAIT DU PRODUIT QUE LE CLIENT DEVAIT VENIR CHERCHER » (Alex, 30/08 au soir).
{
  const { questionRdv, confirmationRdv } = await import('../lib/confirmation-rdv.js')

  // Le rendez-vous de la capture : Head Spa 60 €, acompte 5 € payé, récompense
  // 10 €, bon 40 €, et un shampoing à 21,90 € payé en ligne.
  const RDV = {
    client_prenom: 'Alexandre', client_nom: 'Verstappen',
    date_rdv: '2026-09-02', heure_debut: '15:30',
    prix_estime: 60, acompte_montant: 5, acompte_paye: true, acompte_paye_en_ligne: true,
    fidelite_remise: 10, bon_cadeau_montant: 40,
    commande: {
      id: 'cmd1', statut: 'en_attente', total: 21.90,
      bon_cadeau_montant: 0, fidelite_remise: 0,
      commande_articles: [{ quantite: 1 }],
    },
  }
  const q = questionRdv('annule_commercant', RDV)
  // 🔴 LA PHRASE NE PARLAIT QUE DE L'ACOMPTE, AU CONDITIONNEL.
  verifie('la fenêtre ne parle plus du seul acompte',
    !/son acompte lui sera remboursé/.test(q.message), q.message)
  verifie('elle dit ce qui repart sur la carte', q.message.includes('26,90'), q.message)
  verifie('elle dit le bon cadeau', q.message.includes('40,00') && /bon cadeau/.test(q.message), q.message)
  verifie('elle dit la récompense', q.message.includes('10,00') && /fidélité/.test(q.message), q.message)
  // ⚠️ ET LES PRODUITS SE NOMMENT À PART : c'est de la marchandise que le
  // commerçant a pu préparer, et qui repart en rayon.
  verifie('et elle dit ce que deviennent les produits', /en stock/.test(q.message), q.message)

  // ── Rien d'engagé : on ne compose pas une phrase vide ───────────────────
  const nu = questionRdv('annule_commercant', { client_prenom: 'Zoé', date_rdv: '2026-09-02', heure_debut: '10:00' })
  // ⚠️ REPOINTÉE LE 04/10 (D2) : « Il n’a rien avancé » supposait un homme.
  verifie('sans argent, la fenêtre le dit simplement',
    /Rien n’a été avancé/.test(nu.message) && !/€/.test(nu.message), nu.message)

  // ── ⚠️ UNE COMMANDE DÉJÀ ANNULÉE NE SE REMBOURSE PAS DEUX FOIS ──────────
  const dejaAnnulee = questionRdv('annule_commercant', {
    ...RDV, commande: { ...RDV.commande, statut: 'annulee_client_refund' },
  })
  verifie('une commande déjà annulée ne compte plus',
    dejaAnnulee.message.includes('5,00') && !dejaAnnulee.message.includes('26,90'), dejaAnnulee.message)

  // ── ⚠️ LE BRUT N'EST PAS CE QUE LA CARTE A PAYÉ ─────────────────────────
  // Un bon posé sur la commande n'a jamais été prélevé : l'annoncer
  // promettrait plus que ce que Stripe peut rendre.
  const avecBonSurProduits = questionRdv('annule_commercant', {
    ...RDV,
    commande: { ...RDV.commande, total: 21.90, bon_cadeau_montant: 21.90 },
  })
  verifie('la part payée par bon ne se promet pas sur la carte',
    !avecBonSurProduits.message.includes('26,90'), avecBonSurProduits.message)

  // ── APRÈS LE CLIC : ce qui est RÉELLEMENT parti ─────────────────────────
  const apres = confirmationRdv('annule_commercant', {
    rdv: RDV, raison: 'commercant',
    retours: { refund_montant: 26.90, bon_rendu: 40, recompense_rendue: 10, produits_montant: 21.90 },
  })
  verifie('la confirmation dit le remboursement', apres.includes('26,90'), apres)
  verifie('elle dit le bon', apres.includes('40,00'), apres)
  verifie('elle dit la récompense', apres.includes('10,00'), apres)
  // 🔴 ET UN REMBOURSEMENT RATÉ SE DIT EN PREMIER. Sans ça, le commerçant
  // l'apprend par une réclamation, des semaines plus tard.
  const rate = confirmationRdv('annule_commercant', {
    rdv: RDV, raison: 'commercant',
    retours: { refund_montant: 26.90, refund_error: 'card_declined', bon_rendu: 40, recompense_rendue: 10 },
  })
  verifie('un remboursement raté est annoncé', /n’est pas passé/.test(rate), rate)
  verifie('et il dit quoi faire', /Stripe/.test(rate), rate)
  verifie('sans noyer l’échec dans les bonnes nouvelles', !rate.includes('40,00'), rate)
  // ⚠️ SANS RETOURS, la phrase reste celle d'avant : les autres appelants ne
  // changent pas de comportement.
  const sansRetours = confirmationRdv('annule_commercant', { rdv: RDV, raison: 'commercant' })
  verifie('sans montants, la phrase reste sobre', !/€/.test(sansRetours), sansRetours)

  // ── LE FRÈRE : le no-show ne parlait que de l'acompte lui aussi ─────────
  const ns = questionRdv('no_show', RDV)
  verifie('le no-show nomme le bon cadeau gardé',
    ns.message.includes('40,00') && /bon cadeau/.test(ns.message), ns.message)
  verifie('et l’acompte avec', ns.message.includes('5,00'), ns.message)
  // ⚠️ LA RÉCOMPENSE N'EST PAS DE L'ARGENT QU'IL ENCAISSE : c'est une remise
  // qu'il a consentie. La compter dans « tu gardes » serait un mensonge.
  verifie('mais pas la récompense, qui n’est pas un encaissement',
    !/fidélité/.test(ns.message), ns.message)
}

// ═══ 11) LE CLIENT SAIT CE QUE DEVIENNENT SES PRODUITS ════════════════════
{
  // 🔴 L'EMAIL DISAIT « 26,90 € REVIENNENT » SANS DIRE que le shampoing en
  // faisait partie : le client attendait un sachet qui ne serait pas préparé.
  const rendus = emailRdvAnnule({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins', commercant_slug: 'ciseaux',
    prestation_nom: 'Head Spa', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: true, acompte_montant: 5, refund_en_cours: true, raison_annulation: 'commercant',
    refund_montant: 26.90, bon_rendu: 40, recompense_rendue: 10,
    produits_gardes: false, produits_montant: 21.90,
  })
  verifie('les produits remboursés sont annoncés', /remboursés eux aussi/.test(rendus))
  verifie('et on dit qu’ils ne seront pas mis de côté', /pas mis de côté/.test(rendus))
  verifie('et qu’il peut les recommander', /recommander/.test(rendus))
  verifie('leur montant est dit', rendus.includes('21,90'))
  // ⚠️ ET LES TROIS RETOURS RESTENT LÀ, tous les trois.
  verifie('la carte, le bon et la fidélité sont tous les trois annoncés',
    rendus.includes('26,90') && rendus.includes('40,00') && rendus.includes('10,00'))
  // ⚠️ LES DEUX SORTS DES PRODUITS NE SE MÉLANGENT PAS.
  const gardes = emailRdvAnnule({
    yopper_prenom: 'Alexandre', commercant_nom: 'X', commercant_slug: 'x',
    prestation_nom: 'Coupe', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: true, acompte_montant: 5, refund_en_cours: true, raison_annulation: 'yopper',
    refund_montant: 5, produits_gardes: true, produits_montant: 21.90,
  })
  verifie('des produits gardés ne sont jamais dits remboursés',
    /attendent en boutique/.test(gardes) && !/remboursés eux aussi/.test(gardes))
}
{
  // ⚠️ LE FRÈRE DU NO-SHOW : le bon reste chez le commerçant, et rien ne le
  // disait. Sur un rendez-vous dont l'acompte vaut zéro, le bloc entier
  // disparaissait et le Yopper perdait 40 € en silence.
  const { emailRdvNoShow } = await import('../lib/resend.js')
  // 🔴 LA GARANTIE NE PORTE QUE SUR L'ACOMPTE DÛ (Alex, 30/08 au soir). Le
  // commerçant garde 25 € sur les 40 € du bon, et les 15 € qui dépassaient
  // reviennent. L'email doit dire les DEUX : sans la seconde ligne, le Yopper
  // croit tout perdre et ne va pas vérifier son bon.
  const html = emailRdvNoShow({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins',
    prestation_nom: 'Coupe', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: false, acompte_montant: 0,
    bon_garde: 25, bon_restitue: 15, recompense_rendue: 10,
  })
  verifie('le no-show dit ce qui reste chez le commerçant',
    html.includes('25,00') && /bon cadeau/.test(html))
  verifie('et ce qui revient quand même sur le bon', html.includes('15,00'))
  verifie('et la récompense avec', html.includes('10,00') && /fidélité/.test(html))
  // ⚠️ IL N'ANNONCE JAMAIS LE MONTANT POSÉ, qui n'est ni l'un ni l'autre.
  verifie('le montant posé de 40 € n’apparaît nulle part', !html.includes('40,00'), 'bon_garde + bon_restitue')

  // 🔴 ET LES DEUX PHRASES SE METTENT AU PLURIEL (01/09). Ce gabarit dit ce qui
  // reste acquis ET ce qui revient : les deux parlaient « du bon », et un
  // rendez-vous peut en porter cinq.
  const multi = emailRdvNoShow({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins',
    prestation_nom: 'Coupe', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: false, acompte_montant: 0,
    bon_garde: 25, bon_restitue: 120, nb_bons: 3,
  })
  verifie('🔴 no-show : ce qui reste acquis se dit au pluriel', /de tes bons cadeaux/.test(multi))
  verifie('🔴 no-show : ce qui revient aussi', /sur tes bons cadeaux/.test(multi))
  verifie('et un seul bon reste au singulier des deux côtés',
    /de ton bon cadeau/.test(html) && /sur ton bon cadeau/.test(html) && !/tes bons/.test(html))
  verifie('la route du no-show relaie le nombre de bons',
    /nb_bons:\s+\(rdv\.bons_utilises \|\| \[\]\)\.length/.test(lireCode('app/api/emails/rdv-no-show/route.js')))
  // ⚠️ ET ELLE CHARGE LA COLONNE : sans elle le compte vaut zéro, donc le
  // singulier, en silence. C'est LE défaut le plus fréquent du projet.
  verifie('et elle charge bons_utilises dans son select',
    /client_email, client_prenom, bons_utilises/.test(lireCode('app/api/emails/rdv-no-show/route.js')))
  const rien = emailRdvNoShow({
    yopper_prenom: 'Alexandre', commercant_nom: 'X',
    prestation_nom: 'Coupe', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: false, acompte_montant: 0,
  })
  verifie('et sans argent engagé, aucun bloc ne s’invente',
    !/reste chez le commerçant/i.test(rien) && !/revient quand même/i.test(rien))
  // ⚠️ ET LA ROUTE RELAIE LES TROIS MONTANTS, qu'elle ne peut pas deviner :
  // seule `/api/rdv/no-show` a fait le partage.
  //
  // 🔴 MA PREMIÈRE VERSION CHERCHAIT `bon_cadeau_montant,` N'IMPORTE OÙ dans le
  // fichier : le nom apparaissait AUSSI dans l'argument passé au gabarit, donc
  // retirer la colonne du select laissait la garde verte. Le harnais de
  // mutation l'a dit.
  const route = lireCode('app/api/emails/rdv-no-show/route.js')
  for (const champ of ['bon_garde', 'bon_restitue', 'recompense_rendue']) {
    verifie(`la route du no-show relaie ${champ}`,
      new RegExp(`${champ}[,\\s]`).test(route.split('emailRdvNoShow({')[1] || ''))
  }
  // ⚠️ ET ELLE NE LES RECALCULE PAS : lire `rdv.bon_cadeau_montant` ferait
  // annoncer 40 € perdus quand le commerçant n'en garde que 25.
  verifie('et elle ne réinvente pas le montant depuis la ligne',
    !/bon_garde: rdv\./.test(route))
}
{
  // ⚠️ LA COLONNE ABSENTE D'UN SELECT, septième occurrence évitée. Sans
  // `bon_cadeau_montant` et `fidelite_remise` sur la commande jointe, la
  // fenêtre d'annulation promettrait le BRUT des produits.
  const dash = lire('app/dashboard/page.js')
  const jointure = (dash.match(/commande:commandes![^`]*/) || [''])[0]
  verifie('la commande jointe porte le bon cadeau',
    /bon_cadeau_montant/.test(jointure), jointure.slice(0, 200))
  verifie('et la remise de fidélité', /fidelite_remise/.test(jointure), jointure.slice(0, 200))
  // ⚠️ ET LE TABLEAU DE BORD RELAIE, jusqu'à l'email et jusqu'à la fenêtre.
  const dashCode = sansProse(dash)
  verifie('le tableau de bord relaie la récompense à l’email',
    /recompense_rendue: j\.recompense_rendue/.test(dashCode))
  verifie('et il montre au commerçant ce qui est parti',
    /surRetours: \(r\) => \{ retours = r \}/.test(dashCode))
}

// ═══ 12) LE NO-SHOW NE GARDE QUE LA GARANTIE ══════════════════════════════
//
// 🔴 DÉCISION D'ALEX, 30/08 AU SOIR : « la garantie ne porte que sur l'acompte,
// le reste doit être restitué. » Un client qui posait 40 € de bon sur une
// prestation à 60 € avec 50 % d'acompte perdait les 40 € s'il ne venait pas,
// quand la garantie n'en valait que 25. Quinze euros de trop.
{
  const { restitutionNoShow, libelleNoShow } = await import('../lib/rdv-paiement.js')

  // ── LE CAS D'ALEX : le bon a tout couvert, il en garde la garantie ──────
  {
    const p = restitutionNoShow({
      acompte_du: 25, acompte_montant: 0, acompte_paye: false,
      bon_cadeau_montant: 40, fidelite_remise: 10,
    })
    egal('la garantie vaut l’acompte dû', p.garantie, 25)
    egal('rien en caisse, tout venait du bon', p.gardeEnCaisse, 0)
    egal('le commerçant garde 25 € sur le bon', p.gardeSurBon, 25)
    egal('et 15 € retournent au client', p.bonRestitue, 15)
    // ⚠️ LA RÉCOMPENSE N'EST PAS UNE GARANTIE : elle ne coûte rien au
    // commerçant, c'est une remise qu'il a consentie. Elle revient toujours.
    egal('la récompense revient en entier', p.recompenseRendue, 10)
  }

  // ── L'ARGENT COMPTANT S'IMPUTE EN PREMIER ──────────────────────────────
  {
    const p = restitutionNoShow({
      acompte_du: 25, acompte_montant: 5, acompte_paye: true,
      bon_cadeau_montant: 20, fidelite_remise: 0,
    })
    egal('les 5 € encaissés comptent dans la garantie', p.gardeEnCaisse, 5)
    egal('le bon comble les 20 € qui manquaient', p.gardeSurBon, 20)
    // 🔴 SI CE NOMBRE N'EST PAS ZÉRO, on rend du bon en gardant du liquide
    // au-delà de la garantie.
    egal('et rien ne dépasse, donc rien ne revient', p.bonRestitue, 0)
  }

  // ── UN BON QUI COUVRE BIEN AU-DELÀ ─────────────────────────────────────
  {
    const p = restitutionNoShow({
      acompte_du: 25, acompte_montant: 0, acompte_paye: false,
      bon_cadeau_montant: 60, fidelite_remise: 0,
    })
    egal('la garantie reste plafonnée à l’acompte dû', p.gardeSurBon, 25)
    egal('et 35 € reviennent', p.bonRestitue, 35)
  }

  // ── SANS BON : l'acompte encaissé reste, et c'est tout ─────────────────
  {
    const p = restitutionNoShow({
      acompte_du: 25, acompte_montant: 25, acompte_paye: true,
      bon_cadeau_montant: 0, fidelite_remise: 0,
    })
    egal('le commerçant garde son acompte', p.gardeEnCaisse, 25)
    egal('il n’y a aucun bon à partager', p.bonRestitue, 0)
  }

  // ── 🔴 LE PIÈGE DU ZÉRO, HUITIÈME FOIS : `null` N'EST PAS `0` ──────────
  //
  // Un rendez-vous antérieur à la colonne ne dit pas que rien n'était dû : il
  // ne dit RIEN. Inventer une garantie qu'on ne sait pas prouver, ce serait
  // retenir de l'argent sur une supposition.
  {
    const p = restitutionNoShow({
      acompte_montant: 0, acompte_paye: false,
      bon_cadeau_montant: 40, fidelite_remise: 10,
    })
    verifie('un acompte dû absent se sait', p.connu === false)
    egal('on ne garde alors que l’argent encaissé', p.gardeSurBon, 0)
    egal('et le bon revient en entier', p.bonRestitue, 40)
  }
  {
    // 🔴 ET LA GARANTIE RAPPORTÉE VAUT L'ENCAISSÉ, PAS ZÉRO. Sans acompte dû,
    // les deux lectures donnent le même PARTAGE : c'est le nombre ANNONCÉ au
    // commerçant qui les sépare. Mesuré muet sans ce contrôle, parce que la
    // garde ne regardait que le bon.
    const p = restitutionNoShow({
      acompte_montant: 5, acompte_paye: true,
      bon_cadeau_montant: 40, fidelite_remise: 0,
    })
    egal('la garantie annoncée vaut l’argent encaissé', p.garantie, 5)
    egal('et les 5 € restent chez le commerçant', p.gardeEnCaisse, 5)
    egal('le bon revient quand même en entier', p.bonRestitue, 40)
  }
  {
    // ⚠️ ET UN ZÉRO EXPLICITE EST UNE VRAIE RÉPONSE : aucun acompte n'était
    // demandé, donc aucune garantie, donc tout revient. Confondre les deux
    // ferait garder 40 € à un commerçant qui n'avait rien exigé.
    const p = restitutionNoShow({
      acompte_du: 0, acompte_montant: 0, acompte_paye: false,
      bon_cadeau_montant: 40, fidelite_remise: 0,
    })
    verifie('un acompte dû de zéro est CONNU', p.connu === true)
    egal('et le bon revient tout de même en entier', p.bonRestitue, 40)
  }

  // ── 🔴 LE PAIEMENT D'AVANCE, ET LA BORNE QUI LE REND POSSIBLE (31/08) ───
  //
  // `gardeEnCaisse` valait l'encaissé TOUT COURT : le commerçant gardait tout
  // l'argent entré, quelle que soit la garantie. Ça ne se voyait pas, parce que
  // l'acompte encaissé ne dépasse jamais l'acompte dû. Le paiement d'avance
  // rend ce dépassement normal, et sans cette borne le premier lapin ferait
  // perdre au client la TOTALITÉ de son argent.
  {
    const p = restitutionNoShow({
      acompte_du: 0, acompte_montant: 20, acompte_paye: true, acompte_paye_en_ligne: true,
      bon_cadeau_montant: 0, fidelite_remise: 0,
    })
    egal('🔴 aucune garantie exigée, donc rien n’est gardé', p.gardeEnCaisse, 0)
    egal('🔴 et les 20 € payés d’avance repartent en entier', p.carteRestituee, 20)
    egal('la garantie annoncée vaut bien zéro', p.garantie, 0)
  }
  {
    // ⚠️ L'ACOMPTE ORDINAIRE NE BOUGE PAS D'UN CENTIME. Une borne qui
    // rembourserait aussi les acomptes serait une régression, pas un correctif.
    const p = restitutionNoShow({
      acompte_du: 25, acompte_montant: 25, acompte_paye: true, acompte_paye_en_ligne: true,
      bon_cadeau_montant: 0, fidelite_remise: 0,
    })
    egal('un acompte normal reste chez le commerçant', p.gardeEnCaisse, 25)
    egal('et rien ne part sur la carte', p.carteRestituee, 0)
  }
  {
    // ⚠️ ET UN ACOMPTE DE 100 % N'EST PAS UNE AVANCE : le commerçant l'a
    // EXIGÉ. C'est toute la différence que porte `acompte_du`, et c'est
    // pourquoi aucune colonne de nature n'a été créée.
    const p = restitutionNoShow({
      acompte_du: 60, acompte_montant: 60, acompte_paye: true, acompte_paye_en_ligne: true,
      bon_cadeau_montant: 0, fidelite_remise: 0,
    })
    egal('🔴 un acompte exigé à 100 % se garde en entier', p.gardeEnCaisse, 60)
    egal('et rien n’est remboursé', p.carteRestituee, 0)
  }
  {
    // Le cas complet : avance de 20 €, un bon de 40 € et une récompense.
    const p = restitutionNoShow({
      acompte_du: 0, acompte_montant: 20, acompte_paye: true, acompte_paye_en_ligne: true,
      bon_cadeau_montant: 40, fidelite_remise: 10,
    })
    egal('l’avance revient', p.carteRestituee, 20)
    egal('le bon aussi, en entier', p.bonRestitue, 40)
    egal('et la récompense', p.recompenseRendue, 10)
    egal('le commerçant ne garde rien du tout', p.gardeEnCaisse + p.gardeSurBon, 0)
  }
  {
    // ⚠️ ET LA PHRASE LE DIT. Sur un rendez-vous payé d'avance, c'est le plus
    // gros des trois retours et le seul qui quitte vraiment sa poche.
    const { garde, rend } = libelleNoShow(restitutionNoShow({
      acompte_du: 0, acompte_montant: 20, acompte_paye: true, acompte_paye_en_ligne: true,
      bon_cadeau_montant: 0, fidelite_remise: 0,
    }))
    verifie('🔴 la phrase annonce le remboursement sur la carte',
      /20,00/.test(rend) && /carte/.test(rend), rend)
    egal('et le commerçant ne lit pas qu’il garde quelque chose', garde, '')
  }

  // ── LES DEUX PHRASES, ET AUCUNE NE MENT ────────────────────────────────
  {
    const { garde, rend } = libelleNoShow(restitutionNoShow({
      acompte_du: 25, acompte_montant: 5, acompte_paye: true,
      bon_cadeau_montant: 40, fidelite_remise: 10,
    }))
    verifie('la phrase dit la garantie et son détail',
      /25,00/.test(garde) && /5,00/.test(garde) && /20,00/.test(garde), garde)
    verifie('et celle du retour dit ce qui dépassait',
      /20,00/.test(rend) && /bon cadeau/.test(rend), rend)
    verifie('et la récompense', /10,00/.test(rend) && /carte/.test(rend), rend)
  }
}
{
  const { questionRdv, confirmationRdv } = await import('../lib/confirmation-rdv.js')
  const RDV = {
    client_prenom: 'Alexandre', client_nom: 'Verstappen',
    date_rdv: '2026-09-02', heure_debut: '15:30',
    prix_estime: 60, acompte_du: 25, acompte_montant: 0, acompte_paye: false,
    bon_cadeau_montant: 40, fidelite_remise: 10,
  }
  const q = questionRdv('no_show', RDV)
  // 🔴 « TU GARDES SON ACOMPTE » DISAIT DEUX FAUSSETÉS À LA FOIS : l'acompte
  // vaut zéro, et il ne garde plus tout.
  verifie('la fenêtre ne dit plus « tu gardes son acompte »',
    !/tu gardes ce qu’il a déjà versé/.test(q.message), q.message)
  verifie('elle dit la garantie gardée', q.message.includes('25,00'), q.message)
  verifie('elle dit ce qui retourne sur le bon', q.message.includes('15,00'), q.message)
  verifie('et la récompense qui revient', q.message.includes('10,00'), q.message)

  // ⚠️ « ON NE SAIT PAS » SE DIT, sinon le commerçant croit à une erreur.
  const ancien = questionRdv('no_show', { ...RDV, acompte_du: undefined })
  verifie('un rendez-vous sans acompte dû l’explique',
    /antérieur au calcul de la garantie/.test(ancien.message), ancien.message)

  // ── APRÈS LE CLIC : ce que la route a réellement rendu ─────────────────
  const apres = confirmationRdv('no_show', {
    rdv: RDV,
    retours: { garantie: 25, bon_restitue: 15, recompense_rendue: 10 },
  })
  verifie('la confirmation dit la garantie', apres.includes('25,00'), apres)
  verifie('et ce qui est reparti', apres.includes('15,00') && apres.includes('10,00'), apres)
  const sansRetours = confirmationRdv('no_show', { rdv: RDV })
  verifie('sans montants, la phrase reste sobre', !/€/.test(sansRetours), sansRetours)
}
{
  // ⚠️ LE NO-SHOW PASSE PAR LE SERVEUR, dernier frère du trou fermé le 29/08.
  // Une restitution ne part pas du navigateur d'un commerçant.
  const dash = sansProse(lire('app/dashboard/page.js'))
  verifie('le tableau de bord ne marque plus l’absence lui-même',
    /postPro\('\/api\/rdv\/no-show'/.test(dash))
  const src = lireCode('app/api/rdv/no-show/route.js')
  // ⚠️ RÉORIENTÉE LE 29/09 (équipe) : « absent » débite une garantie, c'est la case « Argent ».
  verifie('la route du no-show a sa garde d’autorisation',
    /gardeLigneEquipe\(request, supabase, 'rdv_reservations', rdv_id, 'argent'\)/.test(src))
  // 🔴 LES COLONNES DU PARTAGE DOIVENT ARRIVER JUSQU'À LA ROUTE.
  const selectRdv = (src.match(/\.select\(`([^`]*)`\)/) || ['', ''])[1]
  for (const col of ['acompte_du', 'acompte_montant', 'bon_cadeau_id', 'bon_cadeau_montant', 'bons_utilises', 'fidelite_recompense_id', 'fidelite_remise']) {
    verifie(`le select du no-show charge ${col}`, new RegExp(col).test(selectRdv), selectRdv.slice(0, 200))
  }
  // ⚠️ ON RESTITUE LA PART QUI DÉPASSE, JAMAIS LE BON ENTIER.
  //
  // 🔴 ET DEPUIS LE 01/09, CETTE PART SE RÉPARTIT SUR LES BONS QUI ONT PAYÉ, en
  // commençant par le dernier servi : miroir du débit, donc l'argent revient sur
  // le bon qui expire le plus tard. La reposer entière sur le premier créerait
  // de l'argent d'un côté et en détruirait de l'autre.
  verifie('la route restitue la part qui dépasse, pas le bon entier',
    /repartirRestitution\(lignesBonsDe\(rdv\), part\.bonRestitue\)/.test(src)
    && !/bonMontant: rdv\.bon_cadeau_montant/.test(src))
  // ⚠️ ET UN RENDEZ-VOUS ANNULÉ NE SE MARQUE PAS ABSENT : il n'a pas eu lieu,
  // et lui appliquer la garantie ferait garder un acompte déjà remboursé.
  verifie('un rendez-vous annulé ne peut pas être noté absent',
    /statut === 'annule_client' \|\| rdv\.statut === 'annule_commercant'/.test(src))
  // ⚠️ ET LE REJEU NE RESTITUE PAS DEUX FOIS.
  verifie('la bascule de statut sert de verrou',
    /\.neq\('statut', 'no_show'\)/.test(src) && /basculees \|\| \[\]\)\.length === 0/.test(src))

  // ─── 🔴 LE REMBOURSEMENT DE CE QUI DÉPASSE LA GARANTIE (31/08) ──────────
  //
  // Cette route ne remboursait RIEN, et ça suffisait tant que l'encaissé ne
  // pouvait pas dépasser la garantie. Calculer une restitution sans la verser,
  // ce serait annoncer un geste qu'on ne fait pas.
  // ⚠️ `stripe_refund_amount` AJOUTÉE LE 04/10 (Annul-I7) : c'est elle qui dit
  // combien est déjà parti, et donc ce qui reste à rendre.
  for (const col of ['stripe_payment_intent_id', 'stripe_refund_id', 'stripe_refund_amount', 'stripe_account_id']) {
    verifie(`🔴 le select du no-show charge ${col}`,
      new RegExp(col).test(selectRdv), selectRdv.slice(0, 320))
  }
  // ⚠️ GARDES RÉORIENTÉES LE 04/10 (Annul-I7) : la route ne rembourse plus
  // `part.carteRestituee` « sauf si un identifiant existe », elle rembourse CE
  // QUI RESTE une fois déduit ce que Stripe a déjà rendu. La règle s'exécute
  // au banc plus bas (`resteARembourser`) ; ici on vérifie que la route la suit.
  verifie('🔴 la route rembourse ce qui dépasse la garantie',
    /const reste = resteARembourser\(part\.carteRestituee, rdv\)/.test(src)
    && /if \(reste > 0 && aPayeEnLigne\)/.test(src) && /stripe\.refunds\.create/.test(src))
  // ⚠️ LE MONTANT EST OBLIGATOIRE. Un `refunds.create` sans `amount` rend TOUT
  // le paiement : le commerçant perdrait la garantie qu'il a le droit de garder.
  verifie('🔴 et il rembourse un MONTANT, pas la totalité du paiement',
    /amount: Math\.round\(reste \* 100\)/.test(src),
    'refunds.create sans amount rembourserait aussi la garantie')
  verifie('un remboursement déjà fait n’est pas rejoué',
    /resteARembourser\(part\.carteRestituee, rdv\)/.test(src) && !/part\.carteRestituee > 0 && aPayeEnLigne/.test(src))
  verifie('et la trace du remboursement est écrite, en cumul',
    /stripe_refund_id: refund\.id/.test(src)
    && /stripe_refund_amount: Math\.round\(\(dejaRembourse \+ reste\) \* 100\) \/ 100/.test(src))
  // 🔴 L'ORDRE, ET C'EST LA LEÇON DU 30/08 AU SOIR : on rend les avantages
  // AVANT de rembourser, sinon le webhook `charge.refunded` passe devant nous
  // et refait les mêmes gestes pendant qu'on les fait.
  verifie('🔴 on rend AVANT de rembourser',
    src.indexOf('rendreAvantagesRdv(') < src.indexOf('stripe.refunds.create'),
    'le remboursement passe avant la restitution : le webhook doublera')
  // ⚠️ ON ANNONCE L'ÉTAT, PAS NOTRE INTENTION. Les deux champs se distinguent :
  // ce qui est DÛ, et ce qui est réellement PARTI.
  // ⚠️ RÉORIENTÉE LE 04/10 : le dû est ce qui RESTE, pas la part brute.
  verifie('la réponse distingue le dû du versé',
    /carte_a_restituer: reste,/.test(src)
    && /carte_restituee: refundId \? reste : 0/.test(src))
  verifie('et un échec de remboursement remonte jusqu’à l’écran',
    /remboursement_erreur: refundError/.test(src))
}
{
  // ⚠️ LES QUATRE CHEMINS DE CRÉATION FIGENT L'ACOMPTE DÛ, sans quoi le partage
  // n'aurait aucune borne et le bon resterait acquis en entier.
  // 🔴 ON COMPTE, ON NE CHERCHE PAS. Deux de ces fichiers écrivent l'acompte
  // dû à DEUX endroits : un payload et des métadonnées pour l'un, deux payloads
  // pour l'autre. Une garde de présence restait verte quand on en retirait un
  // seul, et le harnais de mutation l'a dit. C'est le piège des deux
  // `<NoteHorsApp/>` du 30/08, à l'identique.
  for (const [nom, chemin, attendu] of [
    ['la route serveur de réservation', 'app/api/rdv/reserver/route.js', 2],
    ['le tunnel avec produits', 'app/api/stripe/checkout/create-rdv-commande/route.js', 2],
    ['le tunnel à simple acompte', 'app/api/stripe/checkout/create-rdv-acompte/route.js', 1],
    ['la modale du tableau de bord', 'app/dashboard/ModalNouveauRdv.js', 1],
    ['le webhook Stripe', 'app/api/stripe/webhook/route.js', 1],
  ]) {
    const combien = (lireCode(chemin).match(/acompte_du:/g) || []).length
    egal(`${nom} fige l’acompte dû partout où il le faut`, combien, attendu)
  }
  // 🔴 ET LE WEBHOOK NE LE TRANSFORME PAS EN ZÉRO. `Number(undefined) || null`
  // rendrait null, mais `Number('') || null` aussi, et surtout un acompte dû
  // légitimement nul deviendrait « inconnu ». On distingue les trois.
  const wh = lireCode('app/api/stripe/webhook/route.js')
  verifie('le webhook distingue « absent » de « zéro »',
    /meta\.acompte_du === undefined \|\| meta\.acompte_du === ''/.test(wh))
}

// ═══════════════════════════════════════════════════════════════════════════
// LA REMISE SUR UNE PRESTATION EST CELLE QUI EST DÉBITÉE (06/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CE QU'ON GARDE, ET C'EST DU CODE D'ARGENT. Depuis le 06/09 un deal peut
// viser une prestation de rendez-vous. Les trois routes qui décident ce que le
// client paie lisaient toutes `prestation.prix`, c'est-à-dire le prix PLEIN :
// l'écran aurait affiché « -20 % » et la carte aurait été débitée du tarif
// complet. Le sens de l'erreur compte — le client aurait été SURFACTURÉ.
//
// ⚠️ ET LE MODULE EST PARTAGÉ. Trois copies du même chargement auraient divergé
// au premier ajustement : c'est exactement le défaut qui a fait naître
// `lib/deals.js` le 03/08, quand quatre écrans interprétaient chacun une remise
// à leur façon.
{
  const ROUTES = [
    'app/api/rdv/reserver/route.js',
    'app/api/stripe/checkout/create-rdv-acompte/route.js',
    'app/api/stripe/checkout/create-rdv-commande/route.js',
  ]
  for (const r of ROUTES) {
    const src = lireCode(r)
    verifie(`🔴 ${r.split('/').slice(-2)[0]} part du prix REMISÉ`,
      /const \{ prix: prixBase \} = await prixPrestationServeur\(/.test(src),
      'la carte serait débitée du tarif plein sur une prestation en promotion')
    // 🔴 ET PLUS AUCUNE LECTURE DU PRIX PLEIN À CÔTÉ. Une ligne oubliée juste
    // en dessous rendrait la garde ci-dessus décorative.
    verifie(`et ${r.split('/').slice(-2)[0]} ne relit plus prestation.prix`,
      !/prestation\??\.prix != null \? Number\(prestation\.prix\) : null/.test(src))
  }

  // ⚠️ UN SEUL CHARGEMENT, PARTAGÉ PAR LES TROIS. S'il était recopié, les trois
  // routes finiraient par ne plus filtrer les mêmes deals.
  const MOD = lireCode('lib/prix-prestation-server.js')
  // 🔴 GARDE REPOINTÉE LE 06/09, ET ELLE MESURAIT UNE FORME. Elle exigeait un
  // `.eq('prestation_id', …)` : elle a rougi le jour où la requête s'est
  // élargie aux remises GLOBALES, c'est-à-dire sur une correction. Son intention
  // était « ne charge pas tout le catalogue », pas « garde ce filtre-là ».
  //
  // ⚠️ ON MESURE DONC LES DEUX FAITS : la lecture reste bornée au commerçant, et
  // elle ne va chercher que ce qui peut concerner cette prestation.
  verifie('🔴 la lecture reste bornée à ce commerçant',
    /\.eq\('commercant_id', prestation\.commercant_id\)/.test(MOD),
    'charger tout le catalogue sur un chemin d’argent appelé à chaque réservation')
  // 🔴 GARDE VERTE GRÂCE À UN JUMEAU, trouvée par le harnais. Une première
  // version cherchait `cible_tout` n'importe où dans le fichier : le mot
  // apparaît AUSSI dans le `.or(…)` juste en dessous, donc le retirer du
  // `.select()` la laissait verte — et la colonne serait revenue `undefined`,
  // rendant toute remise globale invisible au serveur.
  //
  // ⚠️ ON DÉCOUPE LA LISTE DE COLONNES ET ON Y CHERCHE. Le défaut « colonne
  // absente d'un select » est le plus fréquent de ce projet, et il ne lève
  // aucune erreur.
  const colPPS = ((MOD.match(/\.select\('([^']+)'\)/) || [])[1] || '').split(/,\s*/)
  verifie('la liste de colonnes du module se découpe', colPPS.length > 5, colPPS.join('|'))
  for (const c of ['deal_type', 'remise_pct', 'prix_deal', 'prestation_id', 'cible_tout']) {
    verifie(`🔴 le module charge la colonne ${c}`, colPPS.includes(c),
      'le serveur facturerait le prix plein sur une remise que la fiche affiche')
  }
  verifie('🔴 et elle vise cette prestation OU une remise globale',
    /prestation_id\.eq\.\$\{prestation\.id\}/.test(MOD) && /cible_tout\.eq\.\$\{TOUT_PRESTATIONS\}/.test(MOD),
    'une remise globale serait invisible au serveur et le client paierait plein tarif')
  verifie('et seulement les deals actifs', /\.eq\('actif', true\)/.test(MOD))
  // 🔴 UNE LECTURE QUI ÉCHOUE NE BRADE RIEN. Mieux vaut ne pas appliquer une
  // remise que la deviner : un `error` non lu est un espoir, pas une action.
  //
  // ⚠️ ON COMPTE LES DEUX REPLIS, ON NE MESURE PAS UNE DISTANCE. Une première
  // version cherchait le repli « à moins de deux cents caractères du `if
  // (error)` » : une ligne glissée entre les deux l'aurait laissée verte, et ce
  // projet vient de s'y faire prendre le matin même sur le renvoi du catalogue.
  const replis = MOD.match(/return \{ prix: plein, remise: null, deals: \[\] \}/g) || []
  verifie('🔴 les DEUX sorties rendent le prix PLEIN', replis.length === 2,
    `${replis.length} repli(s) au lieu de 2 : sans prix connu ou base muette`)
  // ✅ SAUF UNE TABLE (décision d'Alex, 10/09 au soir) : elle n'a pas de prix,
  // et c'est la SEULE sortie qui rende `null`. Cette garde est PRÉCISÉE, pas
  // désarmée : il en faut exactement une, gardée par `estParCouverts`, et placée
  // AVANT toute lecture des remises. Une base muette, elle, rend toujours le
  // prix plein, et le compte des deux replis juste au-dessus le vérifie encore.
  const sortiesNulles = MOD.match(/return \{ prix: null/g) || []
  const iTable = MOD.indexOf('if (estParCouverts(prestation)) return { prix: null, remise: null, deals: [] }')
  const iLecture = MOD.indexOf(".from('yoppaa_deals')")
  verifie('🔴 et aucune sortie ne rend un prix nul, sauf celle d’une table, avant toute lecture',
    sortiesNulles.length === 1 && iTable !== -1 && iLecture !== -1 && iTable < iLecture,
    `${sortiesNulles.length} sortie(s) nulle(s), table à ${iTable}, lecture à ${iLecture} : une base muette ferait disparaître le prix au lieu de le laisser plein`)
  // ⚠️ ET IL NE TOUCHE À AUCUNE TABLE À DONNÉES PERSONNELLES. Il tourne avec la
  // clé de service : une lecture de trop y serait invisible.
  //
  // ⚠️ ON COMPTE AVANT DE COMPARER. `every` sur un tableau VIDE rend `true` :
  // si la regex cessait de trouver quoi que ce soit, la garde serait verte sans
  // rien mesurer. C'est la garde verte pour rien, troisième fois cette semaine.
  const tables = MOD.match(/\.from\('([a-z_]+)'\)/g) || []
  verifie('le module lit exactement une table', tables.length === 1, `${tables.length} lecture(s)`)
  verifie('🔴 et c’est yoppaa_deals, aucune donnée personnelle',
    tables.length === 1 && tables[0] === ".from('yoppaa_deals')", tables.join(', '))

  // ── L'ÉCRAN AFFICHE CE QUE LE SERVEUR VA DÉBITER ────────────────────────
  //
  // ⚠️ L'écran n'engage rien, mais il ne doit pas annoncer autre chose que ce
  // qui sera prélevé : c'est ainsi qu'on fabrique une réclamation.
  const FICHE = lireCode('app/commander/rdv/[slug]/page.js')
  // 🔴 GARDE FAUSSE, TROUVÉE PAR LE HARNAIS. Elle vérifiait la SIGNATURE
  // `function formatPrix(prestation, deals = [])` : glisser une sortie
  // anticipée qui relit `prestation.prix` la laissait VERTE, parce que la
  // signature ne bouge pas. ⚠️ Une garde qui mesure une forme ne dit rien du
  // corps — c'est la même classe que « la marque ne coiffe que l'invendu », qui
  // mesurait les habits pendant que le défaut vivait dans le tracé.
  const iFmt = FICHE.indexOf('function formatPrix(')
  const finFmt = FICHE.indexOf('\n}', iFmt)
  const corpsFmt = iFmt === -1 ? '' : FICHE.slice(iFmt, finFmt === -1 ? undefined : finFmt)
  verifie('le corps de formatPrix se découpe', corpsFmt.length > 40, String(corpsFmt.length))
  verifie('🔴 la fiche CALCULE le prix remisé de la prestation',
    /prixEffectifPrestation\(prestation, deals\)/.test(corpsFmt),
    'la fiche annoncerait le tarif plein sur une prestation en promotion')
  verifie('🔴 et elle ne relit plus le prix plein au passage',
    corpsFmt.length > 40 && !/prestation\.prix/.test(corpsFmt),
    'une sortie anticipée suffirait à rendre le calcul décoratif')
  verifie('🔴 et le prix figé sur le rendez-vous est le prix remisé',
    /const prixEstime = prixEffectifPrestation\(prestationChoisie, deals\)/.test(FICHE))
  verifie('🔴 l’acompte annoncé suit le prix remisé',
    (FICHE.match(/prixEffectifPrestation\(prestationChoisie, deals\)/g) || []).length >= 3,
    'un acompte assis sur le prix plein ferait avancer plus que sa part')
  verifie('et le prix barré se montre',
    /remiseSurPrestation\(p, deals\) && \(/.test(FICHE))

  // ── LE FORMULAIRE DE DEAL ───────────────────────────────────────────────
  const CFG = lireCode('app/dashboard/ConfigDashboard.js')
  verifie('🔴 le déroulant propose les prestations',
    /<optgroup label="Une prestation de rendez-vous">/.test(CFG))
  // 🔴 SEULEMENT SUR UNE REMISE. Un lot de séances est un carnet d'abonnement,
  // qui décompte les séances et porte une validité : deux systèmes qui comptent
  // différemment se découvriraient sur un client qui revient une fois de trop.
  verifie('🔴 et seulement sur une remise, jamais sur un lot',
    /estRemiseSurProduit\(\{ deal_type: form\.deal_type \}\) && prestationsLiables\.length > 0 && \(/.test(CFG))
  // 🔴 SANS PRIX, PAS DE REMISE. « Prix sur demande » est un choix du
  // commerçant : vingt pour cent de rien ne veut rien dire.
  verifie('🔴 une prestation sans prix n’est pas proposée',
    /prestationsLiables = prestations\.filter\(p =>\s*\n?\s*p\.actif !== false && !p\.deleted_at && Number\(p\.prix\) > 0\)/.test(CFG))
  // ⚠️ UNE SEULE CIBLE À LA FOIS : chaque branche efface les deux autres, sinon
  // la contrainte de base refuse l'enregistrement avec un message que le
  // commerçant ne peut pas comprendre.
  // ⚠️ ANCRE REPOINTÉE : une quatrième cible est née, et cette garde citait la
  // liste exacte des trois. Elle a rougi sur l'ajout, pas sur un défaut.
  verifie('🔴 choisir une prestation efface les trois autres cibles',
    /article_id: '', categorie_cible: '', cible_tout: '', prestation_id: id,/.test(CFG))
  verifie('et choisir un article efface la prestation',
    /article_id: valeur,\s*\n\s*categorie_cible: '',\s*\n\s*prestation_id: '',/.test(CFG))
  verifie('la prestation part bien dans le payload',
    /prestation_id: \(estRemiseSurProduit\(\{ deal_type: form\.deal_type \}\) && form\.prestation_id\) \? form\.prestation_id : null,/.test(CFG))

  // ── LA REMISE GLOBALE (Alex, 06/09) ────────────────────────────────────
  //
  // 🔴 « -10 % SUR TOUT » N'EXISTAIT PAS : il fallait une promotion par
  // catégorie, et les articles sans catégorie étaient oubliés en silence.
  verifie('🔴 le menu propose « tout d’un coup »',
    /<optgroup label="Tout d’un coup">/.test(CFG))
  verifie('avec les deux portées séparées',
    /<option value=\{`tout:\$\{TOUT_PRODUITS\}`\}>Tous mes produits<\/option>/.test(CFG)
    && /<option value=\{`tout:\$\{TOUT_PRESTATIONS\}`\}>Toutes mes prestations<\/option>/.test(CFG),
    'une seule option ferait brader ses coupes à un coiffeur qui pense à ses shampoings')
  // 🔴 SEULEMENT SUR UNE REMISE EN POURCENTAGE. « Tous mes produits à 5 € »
  // n'est pas une promotion, c'est une erreur de saisie qui brade le magasin.
  // `estRemiseSurProduit` ne suffirait PAS : il accepte aussi le prix fixe.
  verifie('🔴 et seulement sur une remise en POURCENTAGE',
    /\{form\.deal_type === TYPE_REMISE && \(articlesLiables\.length > 0 \|\| prestationsLiables\.length > 0\) && \(/.test(CFG),
    '« tous mes produits à 5 € » braderait le magasin')
  verifie('🔴 le payload la réserve au pourcentage lui aussi',
    /cible_tout: \(form\.deal_type === TYPE_REMISE && form\.cible_tout\) \? form\.cible_tout : null,/.test(CFG))
  // ⚠️ QUATRE CIBLES, TOUJOURS UNE SEULE À LA FOIS : chaque branche efface les
  // trois autres, sinon la contrainte de base refuse l'enregistrement avec un
  // message que le commerçant ne peut pas comprendre.
  verifie('🔴 choisir « tout » efface les trois autres cibles',
    /article_id: '', prestation_id: '', categorie_cible: '', cible_tout: v\.slice\(5\)/.test(CFG))
  verifie('et les trois autres effacent « tout »',
    (CFG.match(/cible_tout: '',/g) || []).length >= 3,
    'un choix précédent traînerait et ferait refuser l’enregistrement')

  // 🔴 AUCUNE OPTION EN VRAC SOUS UN TITRE DE GROUPE (Alex, 06/09). Les
  // produits étaient listés SANS groupe, juste après « Tout d'un coup » : un
  // commerçant qui n'a qu'un seul produit le voyait collé sous ce titre et
  // croyait qu'il en faisait partie. Toutes les autres familles avaient déjà
  // le leur.
  //
  // ⚠️ LA RÈGLE N'EST PAS « TOUJOURS UN GROUPE », c'est « pas de mélange ». Le
  // menu du second article d'un duo n'a AUCUN groupe et va très bien : rien ne
  // peut y être pris pour autre chose. Le défaut naît quand certaines entrées
  // sont coiffées et d'autres pas.
  const iSel = CFG.indexOf('<select value={form.cible_tout')
  const finSel = CFG.indexOf('</select>', iSel)
  const bloc = iSel === -1 ? '' : CFG.slice(iSel, finSel)
  verifie('le menu de cible se découpe', bloc.length > 300, String(bloc.length))
  const horsGroupe = bloc.replace(/<optgroup[\s\S]*?<\/optgroup>/g, '')
  verifie('🔴 une seule option hors groupe : la ligne vide',
    (horsGroupe.match(/<option/g) || []).length === 1,
    `${(horsGroupe.match(/<option/g) || []).length} options en vrac sous un titre qui n’est pas le leur`)
  // ⚠️ ET L'ORDRE SUIT LE LIBELLÉ : « sur tout, ou sur un produit, une
  // catégorie ou une prestation ». Un menu qui énumère dans un autre ordre que
  // son propre libellé fait chercher.
  const ordre = (bloc.match(/<optgroup label="([^"]+)"/g) || []).join(' | ')
  verifie('🔴 les groupes suivent l’ordre annoncé par le libellé',
    /Tout d’un coup[\s\S]*Un produit précis[\s\S]*Toute une catégorie[\s\S]*Une prestation/.test(ordre),
    ordre)
}

// ═══ AUCUNE PORTE N'ACCEPTE UN CRÉNEAU PASSÉ (10/09 tard) ═════════════════
//
// 🔴 TROIS PORTES SUR QUATRE PRENAIENT UNE DATE D'HIER. Trouvé en cherchant
// les frères du déplacement dans le passé (Alex : « ça ne doit pas être
// possible »). Seule `/api/rdv/reserver` avait la garde ; l'acompte en ligne,
// le rendez-vous avec produits et la séance sur abonnement l'ignoraient.
// La règle est EXÉCUTÉE à des instants choisis, été comme hiver.
{
  const { creneauDejaCommence, rappelVeillePossible } = await import('../lib/timezone.js')
  const t = (iso) => new Date(iso)
  // En septembre, Bruxelles vit à UTC+2 : 19:00 chez nous, 17:00 en UTC.
  verifie('🔴 une minute après le début, le créneau est commencé',
    creneauDejaCommence('2026-09-10', '19:00', t('2026-09-10T17:01:00Z')) === true)
  verifie('⚠️ une minute avant, il ne l’est pas',
    creneauDejaCommence('2026-09-10', '19:00', t('2026-09-10T16:59:00Z')) === false)
  verifie('⚠️ à l’heure pile, il l’est : on ne peut plus y arriver à l’heure',
    creneauDejaCommence('2026-09-10', '19:00', t('2026-09-10T17:00:00Z')) === true)
  verifie('⚠️ l’heure d’hiver compte : 19:00 en janvier, c’est 18:00 en UTC',
    creneauDejaCommence('2027-01-15', '19:00', t('2027-01-15T17:30:00Z')) === false
    && creneauDejaCommence('2027-01-15', '19:00', t('2027-01-15T18:01:00Z')) === true)
  verifie('⚠️ les secondes que la base écrit sont lues',
    creneauDejaCommence('2026-09-10', '19:00:00', t('2026-09-10T16:00:00Z')) === false)
  verifie('🔴 une date illisible compte comme passée : dans le doute, on refuse',
    creneauDejaCommence('hier', '19:00', t('2026-09-10T10:00:00Z')) === true)
  verifie('🔴 une heure absente aussi',
    creneauDejaCommence('2026-09-12', undefined, t('2026-09-10T10:00:00Z')) === true)
  verifie('⚠️ sans horloge fournie, c’est maintenant qui compte',
    creneauDejaCommence('2020-01-01', '10:00') === true && creneauDejaCommence('2099-01-01', '10:00') === false)

  // L'alarme de la veille, promise par l'email de confirmation.
  verifie('🔴 à 23 h du rendez-vous, l’alarme de la veille ne sonnera plus',
    rappelVeillePossible('2026-09-11', '19:00', t('2026-09-10T18:00:00Z')) === false)
  verifie('⚠️ à 25 h, elle sonnera',
    rappelVeillePossible('2026-09-11', '19:00', t('2026-09-10T16:00:00Z')) === true)
  verifie('⚠️ une date illisible ne promet rien',
    rappelVeillePossible(null, '19:00', t('2026-09-10T10:00:00Z')) === false)

  // Les quatre portes l'appellent AVANT leur première écriture : un refus
  // après la commande, le stock ou la session de paiement laisserait tout à
  // défaire.
  const PORTES = [
    ['app/api/rdv/reserver/route.js', 'creneauDejaCommence(date_rdv, heure)', '.insert('],
    ['app/api/stripe/checkout/create-rdv-acompte/route.js', 'creneauDejaCommence(date_rdv, String(heure_debut))', 'stripe.checkout.sessions.create('],
    ['app/api/stripe/checkout/create-rdv-commande/route.js', 'creneauDejaCommence(date_rdv, String(heure_debut))', '.insert('],
    ['app/api/rdv/reserver-abonnement/route.js', 'creneauDejaCommence(dateRdv, heure)', 'creerReservationRdv(db, {'],
  ]
  for (const [chemin, appel, ecriture] of PORTES) {
    const s = lireCode(chemin)
    const pa = s.indexOf(`if (${appel}) {`)
    const pe = s.indexOf(ecriture)
    verifie(`🔴 ${chemin.split('/').slice(-2, -1)[0]} refuse un créneau passé avant d’écrire quoi que ce soit`,
      pa !== -1 && pe !== -1 && pa < pe, `garde en ${pa}, première écriture en ${pe}`)
  }
  verifie('⚠️ les trois routes de la fiche le disent avec le même drapeau',
    ['app/api/rdv/reserver/route.js', 'app/api/stripe/checkout/create-rdv-acompte/route.js', 'app/api/stripe/checkout/create-rdv-commande/route.js']
      .every(c => /error: 'Ce créneau est déjà passé\. Choisis-en un autre\.', creneau_refuse: true \}, \{ status: 409 \}/.test(lireCode(c))))
  verifie('⚠️ et la séance sur abonnement par son code',
    /return NextResponse\.json\(\{ ok: false, error: 'creneau_passe' \}, \{ status: 409 \}\)/.test(lireCode('app/api/rdv/reserver-abonnement/route.js')))

  // La fiche comprend chacun de ces refus et renvoie choisir une autre heure,
  // au lieu d'afficher « Erreur paiement ».
  const FICHE = lireCode('app/commander/rdv/[slug]/page.js')
  const iCommande = FICHE.indexOf("'/api/stripe/checkout/create-rdv-commande'")
  const iAcompte = FICHE.indexOf("'/api/stripe/checkout/create-rdv-acompte'")
  const iReserver = FICHE.indexOf("'/api/rdv/reserver'")
  const RENVOI = /if \(!j\.ok && j\.creneau_refuse\) \{\s*setSubmitError\(j\.error\)\s*setHeureChoisie\(null\)\s*setSubmitting\(false\)\s*setTimeout\(\(\) => allerEtape\(2\), 1200\)\s*return/
  verifie('🔴 la fiche renvoie choisir une heure quand le rendez-vous avec produits refuse',
    iCommande !== -1 && iAcompte > iCommande && RENVOI.test(FICHE.slice(iCommande, iAcompte)))
  verifie('🔴 et quand l’acompte refuse',
    iReserver > iAcompte && RENVOI.test(FICHE.slice(iAcompte, iReserver)))
  verifie('🔴 et quand la séance sur abonnement refuse',
    /j\?\.error === 'creneau_passe'\) \{[\s\S]{0,200}?setHeureChoisie\(null\)[\s\S]{0,120}?allerEtape\(2\)/.test(FICHE))
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 TOUT REMBOURSEMENT PASSE PAR UNE ANNULATION (11/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Trouvé en cherchant qui envoie l'email d'annulation. `/api/stripe/refund`,
// une ébauche de juillet qu'aucun écran n'appelait, remboursait TOUT le
// paiement (acompte ET produits) sans rien annuler. Un Yopper connecté pouvait
// l'appeler avec son propre jeton, dans son délai d'annulation : le webhook
// `charge.refunded` lui rendait ensuite ses bons et sa récompense, et sa
// réservation restait confirmée, ses produits à retirer. Supprimée.
//
// ⚠️ LA LISTE EST FERMÉE. Un remboursement Stripe ne part que d'une route qui
// change le statut dans le même geste. Une nouvelle route qui rembourse fait
// rougir ce banc, et c'est voulu : elle se lit avant d'entrer dans la liste.
{
  const { readdirSync, statSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const rembourseurs = []
  const parcourir = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) { parcourir(p); continue }
      if (!/\.jsx?$/.test(e)) continue
      if (/refunds\.create\(/.test(sansProse(readFileSync(p, 'utf8')))) {
        rembourseurs.push(p.replace(/\\/g, '/').replace(/^.*?\/(app|lib)\//, '$1/'))
      }
    }
  }
  parcourir(join(racine, 'app'))
  parcourir(join(racine, 'lib'))
  const ANNULENT_EN_REMBOURSANT = {
    'app/api/commande/cancel/route.js': 'annulee_client_refund',
    'app/api/rdv/cancel/route.js': 'annule_client',
    'app/api/rdv/annuler-commercant/route.js': 'annule_commercant',
    'app/api/rdv/no-show/route.js': 'no_show',
    // 🔴 Abo-I1 (04/10) : rembourser un abonnement le RÉSILIE toujours
    // (décision d'Alex). La règle de la sonde tient : pas de remboursement
    // sans changement de statut.
    'app/api/rdv/rembourser-abonnement/route.js': 'resilie',
  }
  verifie('la sonde a trouvé des remboursements', rembourseurs.length >= 4, String(rembourseurs.length))
  // ✅ ET UN SEUL QUI REMBOURSE SANS RIEN ANNULER, PARCE QU'IL N'Y A RIEN (03/10) :
  // le webhook, quand la place a disparu entre le contrôle et le paiement.
  // Aucune réservation n'existe à annuler ; la garde vérifie donc qu'il ne
  // rembourse QUE là, dans `refuserApresPaiement`, une seule fois.
  const REMBOURSENT_SANS_RESERVATION = ['app/api/stripe/webhook/route.js']
  verifie('🔴 seules les routes qui changent le statut remboursent',
    JSON.stringify([...rembourseurs].sort())
      === JSON.stringify([...Object.keys(ANNULENT_EN_REMBOURSANT), ...REMBOURSENT_SANS_RESERVATION].sort()),
    rembourseurs.sort().join(' | '))
  {
    const wh = lireCode('app/api/stripe/webhook/route.js')
    const appels = wh.match(/refunds\.create\(/g) || []
    const iFn = wh.indexOf('async function refuserApresPaiement(')
    const iRefund = wh.indexOf('refunds.create(')
    const iFnSuivante = wh.indexOf('\nasync function ', iFn + 10)
    verifie('🔴 le webhook ne rembourse qu’une fois, dans le refus d’une réservation qui n’existe pas',
      appels.length === 1 && iFn > 0 && iRefund > iFn && (iFnSuivante === -1 || iRefund < iFnSuivante),
      `${appels.length} appel(s)`)
  }
  for (const [chemin, statut] of Object.entries(ANNULENT_EN_REMBOURSANT)) {
    verifie(`🔴 ${chemin.split('/').slice(-3, -1).join('/')} écrit « ${statut} » en remboursant`,
      new RegExp(`statut: '${statut}'`).test(lireCode(chemin)))
  }
  verifie('🔴 la route qui remboursait sans annuler n’existe plus',
    !existsSync(join(racine, 'app', 'api', 'stripe', 'refund', 'route.js')))
}

// ═══ LE DÉLAI D'ANNULATION : UNE RÈGLE, UN SEUL ENDROIT ══════════════════
//
// 🔴 IL VIVAIT EN CINQ COPIES, ET TROIS ÉTAIENT FAUSSES DE LA MÊME FAÇON
// (14/09). `rdv_delai_annulation_heures || 24` transforme un délai réglé à ZÉRO
// en vingt-quatre heures : l'email de confirmation, le rappel de 9 h et le
// webhook annonçaient au client une règle que la route d'annulation
// n'appliquait pas, elle qui gardait bien le zéro avec `??`. Le piège du zéro,
// neuvième fois.
{
  const { delaiAnnulationHeures, estAnnulationTardive, DELAI_DEFAUT_VITRINE, DELAI_DEFAUT_TABLE } =
    await import('../lib/rdv-delai-annulation.js')

  egal('un salon sans réglage : le délai habituel', delaiAnnulationHeures({ categorie: 'vitrine' }), DELAI_DEFAUT_VITRINE)
  egal('une boutique sans réglage : le même', delaiAnnulationHeures({ categorie: 'detail' }), DELAI_DEFAUT_VITRINE)
  // ⚠️ CÔTÉ ALIMENTAIRE, LE RENDEZ-VOUS EST UNE TABLE, et personne ne sait la
  // veille à midi qu'il ne dînera pas le soir.
  egal('un restaurant sans réglage : trois heures', delaiAnnulationHeures({ categorie: 'alimentaire' }), DELAI_DEFAUT_TABLE)
  egal('un commerce sans catégorie du tout ne casse pas', delaiAnnulationHeures({}), DELAI_DEFAUT_VITRINE)
  egal('et un commerçant absent non plus', delaiAnnulationHeures(null), DELAI_DEFAUT_VITRINE)
  // 🔴 LE CŒUR DU DÉFAUT.
  egal('🔴 un délai réglé à ZÉRO reste zéro', delaiAnnulationHeures({ categorie: 'alimentaire', rdv_delai_annulation_heures: 0 }), 0)
  egal('un délai réglé prime sur le défaut', delaiAnnulationHeures({ categorie: 'alimentaire', rdv_delai_annulation_heures: 48 }), 48)
  egal('un délai en texte est compris', delaiAnnulationHeures({ rdv_delai_annulation_heures: '12' }), 12)
  egal('un délai négatif ne remonte pas le temps', delaiAnnulationHeures({ rdv_delai_annulation_heures: -5 }), 0)
  egal('un délai illisible retombe sur le défaut', delaiAnnulationHeures({ rdv_delai_annulation_heures: 'bientôt' }), DELAI_DEFAUT_VITRINE)

  // La limite, en heure murale de Bruxelles. Un service à 20:00 avec trois
  // heures de délai se ferme à 17:00, le même jour.
  const table = { date_rdv: '2026-09-19', heure_debut: '20:00' }
  const resto = { categorie: 'alimentaire' }
  verifie('avant la limite, l’annulation n’est pas tardive',
    estAnnulationTardive(table, resto, new Date('2026-09-19T14:59:00+02:00')) === false)
  verifie('🔴 après la limite, elle l’est, et la porte reste OUVERTE',
    estAnnulationTardive(table, resto, new Date('2026-09-19T17:01:00+02:00')) === true)
  verifie('une réservation sans date ne déclare jamais de retard',
    estAnnulationTardive({}, resto, new Date()) === false)

  // ⚠️ ET PLUS AUCUNE COPIE DANS LES QUATRE FICHIERS QUI DÉCIDENT. Un `|| 24`
  // qui revient, c'est le zéro écrasé qui revient avec lui.
  const DECIDENT = [
    'app/api/rdv/cancel/route.js',
    'app/api/emails/rdv-confirme/route.js',
    'app/api/cron/rdv-reminder-9h/route.js',
    'app/api/stripe/webhook/route.js',
  ]
  for (const chemin of DECIDENT) {
    const src = lireCode(chemin)   // `lireCode` dépouille déjà les commentaires
    const court = chemin.split('/').slice(-3, -1).join('/')
    verifie(`${court} : plus de délai calculé sur place`,
      !/rdv_delai_annulation_heures\s*(\|\||\?\?)/.test(src))
    // ⚠️ La route d'annulation passe depuis le 15/09 par `decisionAnnulation`,
    // qui appelle elle-même `delaiAnnulationHeures` : la même règle, un étage
    // plus haut, et ses propres essais dans ce banc et dans celui des
    // abonnements.
    verifie(`${court} : il appelle le module`, /delaiAnnulationHeures\(|decisionAnnulation\(/.test(src))
    // 🔴 ET IL CHARGE LA CATÉGORIE DANS SON SELECT, sans quoi le défaut d'un
    // restaurant serait celui d'un salon. La colonne absente d'un select est le
    // défaut le plus fréquent de ce dépôt, et il ne prévient jamais.
    // ⚠️ LA GARDE VISE LA JOINTURE, PAS LE MOT. Un simple `/categorie/` sur le
    // fichier restait vert quand on retirait la colonne du select : le mot
    // vivait ailleurs, dans `motsReservation(commercant.categorie)`. Trouvé par
    // mutation le 14/09. Une garde qui cherche un mot ne garde rien.
    verifie(`${court} : la catégorie est dans le select des commerçants`,
      /commercants\([^)]*\bcategorie\b[^)]*\)/.test(src))
  }
}

// ═══ L'ACOMPTE ENCAISSÉ SANS PLACE (audit du 03/10) ══════════════════════
//
// 🔴 LE DÉFAUT. La route d'acompte ouvrait Stripe avec un « TODO : valider
// ici » : la place n'était vérifiée qu'au webhook. Cours complet entre-temps,
// le webhook levait, Stripe rejouait trois jours, personne ne remboursait, et
// l'écran de retour disait « confirmé ». Désormais : vérification sans
// écriture AVANT le paiement, remboursement au webhook si la place a quand
// même disparu, et un écran de retour qui attend la réponse du serveur.
{
  const { estRefusDeRegle, refusAvantPaiement, motifApresPaiement } = await import('../lib/refus-reservation.js')
  const { creerReservationRdv } = await import('../lib/rdv-creation-server.js')

  // ─── Le module des refus, exécuté ─────────────────────────────────────
  for (const code of ['place_prise', 'salle_complete', 'prestation_hors_creneau', 'creneau_passe', 'couverts_invalides']) {
    verifie(`🔴 « ${code} » est un refus de règle : il se rembourse, il ne se rejoue pas`, estRefusDeRegle(code))
  }
  verifie('🔴 une panne d’écriture N’EST PAS un refus de règle : elle se rejoue', !estRefusDeRegle('ecriture_impossible'))
  verifie('⚠️ un code inconnu non plus', !estRefusDeRegle('quelque_chose') && !estRefusDeRegle(undefined))
  const pris = refusAvantPaiement({ code: 'place_prise', collectif: true })
  verifie('🔴 avant le paiement, une place prise renvoie choisir une autre heure, en clair',
    pris.status === 409 && pris.corps.creneau_refuse === true && /dernière place vient d’être prise/.test(pris.corps.error), JSON.stringify(pris))
  verifie('⚠️ jamais un code brut à l’écran', !/^place_prise$/.test(pris.corps.error))
  verifie('⚠️ une panne avant paiement ne renvoie pas choisir une heure',
    refusAvantPaiement({ code: 'ecriture_impossible' }).corps.creneau_refuse !== true)
  verifie('🔴 après le paiement, la cliente lit ce qui s’est passé',
    /dernière place a été prise/.test(motifApresPaiement('place_prise')) && /déjà passé/.test(motifApresPaiement('creneau_passe')))
  // 🔴 UN JOUR FERMÉ (03/10) : un refus de règle comme les autres, dit en clair
  // avant le paiement, remboursé après.
  const ferme = refusAvantPaiement({ code: 'jour_ferme' }, { nom: 'Centre Respire' })
  verifie('🔴 un jour fermé se dit en clair et renvoie choisir une autre date',
    ferme.status === 409 && ferme.corps.creneau_refuse === true
    && /Centre Respire ne prend pas de rendez-vous ce jour-là/.test(ferme.corps.error), JSON.stringify(ferme))
  verifie('🔴 un jour fermé après paiement se rembourse, et la cliente lit pourquoi',
    estRefusDeRegle('jour_ferme') && /fermé à la réservation/.test(motifApresPaiement('jour_ferme')))

  // ─── La vérification sans écriture, exécutée ──────────────────────────
  // Une fausse base minimale : la prestation, et les places déjà prises.
  const fausseBase = (placesPrises) => {
    const vu = { insere: false }
    return {
      _vu: vu,
      from(nom) {
        const chaine = {
          select: () => chaine, eq: () => chaine, in: () => chaine, is: () => chaine, neq: () => chaine,
          maybeSingle: async () => ({ data: nom === 'rdv_prestations'
            ? { id: 'p2', nom: 'Hatha yoga', capacite: 12, tva_taux: 6, duree_minutes: 60, commercant_id: 'c1' }
            : nom === 'commercants' ? { id: 'c1', nom: 'Centre Respire', adresse: 'Rue 1' } : null }),
          single: async () => ({ data: { id: 'rdv-x', place_no: 1 }, error: null }),
          insert: () => { vu.insere = true; return chaine },
          then: (r) => r(nom === 'rdv_reservations' ? { data: placesPrises.map(place_no => ({ place_no })) } : { data: [] }),
        }
        return chaine
      },
    }
  }
  const libre = fausseBase([1, 2])
  const essaiLibre = await creerReservationRdv(libre, {
    commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-10-07', heureDebut: '10:00', champs: {}, simulation: true,
  })
  verifie('🔴 la vérification sans écriture dit oui sur un cours avec de la place',
    essaiLibre.ok === true && essaiLibre.simulation === true && essaiLibre.place_no === 3, JSON.stringify(essaiLibre))
  verifie('🔴 et n’écrit RIEN', libre._vu.insere === false)
  const plein = fausseBase(Array.from({ length: 12 }, (_, i) => i + 1))
  const essaiPlein = await creerReservationRdv(plein, {
    commercantId: 'c1', prestationId: 'p2', dateRdv: '2026-10-07', heureDebut: '10:00', champs: {}, simulation: true,
  })
  verifie('🔴 et dit non sur un cours complet, AVANT tout paiement',
    essaiPlein.ok === false && essaiPlein.code === 'place_prise' && plein._vu.insere === false, JSON.stringify(essaiPlein))

  // ─── Les trois routes vérifient AVANT d'ouvrir Stripe ─────────────────
  for (const f of [
    'app/api/stripe/checkout/create-rdv-acompte/route.js',
    'app/api/stripe/checkout/create-rdv-empreinte/route.js',
    'app/api/stripe/checkout/create-rdv-commande/route.js',
  ]) {
    const src = lireCode(f)
    const iEssai = src.search(/creerReservationRdv\(supabase, \{[\s\S]{0,400}?simulation: true,/)
    const iStripe = src.indexOf('stripe.checkout.sessions.create(')
    verifie(`🔴 ${f} vérifie la place avant d’ouvrir le paiement`, iEssai > 0 && iStripe > iEssai, `${iEssai} / ${iStripe}`)
    verifie(`⚠️ ${f} répond le refus en clair`,
      /if \(!essai\.ok\) \{\s+const \{ status, corps \} = refusAvantPaiement\(essai, \{ nom: commercant\.nom \}\)\s+return NextResponse\.json\(corps, \{ status \}\)/.test(src))
  }
  {
    // 🔴 LES DEUX ROUTES SANS PAIEMENT DISENT AUSSI TOUT REFUS DE RÈGLE (03/10).
    // Un jour fermé tombait dans le 500 « Réessaie », et la séance d'abonnement
    // rendait `ecriture_impossible` à tout ce qu'elle ne connaissait pas.
    const reserver = lireCode('app/api/rdv/reserver/route.js')
    verifie('🔴 la réservation sans paiement dit tout refus de règle, sans « Réessaie »',
      /if \(estRefusDeRegle\(res\.code\)\) \{\s+const \{ status, corps \} = refusAvantPaiement\(res, \{ nom: commercant\.nom \}\)\s+return NextResponse\.json\(corps, \{ status \}\)/.test(reserver))
    const abo = lireCode('app/api/rdv/reserver-abonnement/route.js')
    verifie('🔴 la séance d’abonnement aussi',
      /if \(estRefusDeRegle\(res\.code\)\) \{\s+const \{ status, corps \} = refusAvantPaiement\(res, \{\}\)\s+return NextResponse\.json\(\{ ok: false, error: 'refus_regle', message: corps\.error, creneau_refuse: !!corps\.creneau_refuse \}, \{ status \}\)/.test(abo))
    const fiche = lireCode('app/commander/rdv/[slug]/page.js')
    verifie('🔴 et la fiche affiche la raison du serveur pour une séance d’abonnement',
      /j\?\.error === 'refus_regle' && j\.message\) \{\s+setSubmitError\(j\.message\)/.test(fiche))
    verifie('🔴 la fiche retire de sa grille les plages d’une praticienne absente',
      /creneaux: plagesOuvertes\(creneauxFiltres, fermetures, dateStr\),/.test(fiche)
      && /creneaux: plagesOuvertes\(creneauxFiltres, fermetures, j\.iso\),/.test(fiche))
    // 🔴 UN REFUS SE LIT LÀ OÙ LA FICHE RENVOIE (I1, 03/10) : à l'étape 2.
    const etape2 = fiche.slice(fiche.indexOf('{etape === 2 && prestationChoisie && ('), fiche.indexOf('{etape === 3'))
    verifie('🔴 le refus du serveur s’affiche à l’étape 2, où la fiche renvoie choisir',
      etape2.length > 1000 && /\{submitError && \(\s*<div role="alert"/.test(etape2), `${etape2.length} caractères`)
    verifie('⚠️ et s’efface quand une autre heure est choisie',
      /if \(!pris\) \{ setHeureChoisie\(heure\); setAttenteVisee\(null\); setSubmitError\(null\) \}/.test(fiche))
    verifie('et juge les jours fermés avec la règle du serveur',
      /return !!fermetureQuiBloque\(fermetures, \{ dateStr: iso, praticienId: praticienChoisi\?\.id \?\? null \}\)/.test(fiche))
  }
  {
    const commande = lireCode('app/api/stripe/checkout/create-rdv-commande/route.js')
    verifie('🔴 le rendez-vous avec produits vérifie la place AVANT de poser la commande et le stock',
      commande.search(/simulation: true,/) < commande.indexOf(".from('commandes')"))
  }
  verifie('🔴 plus de « TODO : valider ici » sur l’acompte',
    !/TODO : valider l'overlap/.test(lire('app/api/stripe/checkout/create-rdv-acompte/route.js')))
  for (const f of ['app/api/stripe/checkout/create-rdv-acompte/route.js', 'app/api/stripe/checkout/create-rdv-commande/route.js']) {
    verifie(`⚠️ ${f} : la page de paiement expire en trente minutes`,
      /expires_at: Math\.floor\(Date\.now\(\) \/ 1000\) \+ 30 \* 60,/.test(lireCode(f)))
  }

  // ─── Le webhook rembourse un refus de règle, et rejoue une panne ──────
  {
    const wh = lireCode('app/api/stripe/webhook/route.js')
    verifie('🔴 acompte : un refus de règle se rembourse au lieu de se rejouer',
      /if \(!resa\.ok\) \{\s+if \(estRefusDeRegle\(resa\.code\)\) \{\s+await refuserApresPaiement\(supabase, \{ code: resa\.code, meta, paymentIntent,[^}]*avecProduits \}\)\s+return\s+\}\s+throw new Error\(`création RDV impossible/.test(wh))
    verifie('🔴 table garantie : même règle, sans argent en jeu',
      /if \(!resa\.ok\) \{\s+if \(estRefusDeRegle\(resa\.code\)\) \{\s+await refuserApresPaiement\(supabase, \{ code: resa\.code, meta, setupIntentId, compte: compteConnecte \}\)\s+return\s+\}\s+throw new Error\(`création table impossible/.test(wh))
    const iPasse = wh.indexOf("code: 'creneau_passe'")
    verifie('🔴 un paiement arrivé après le début du créneau ne crée rien, il se rembourse',
      iPasse > 0 && iPasse < wh.indexOf('const resa = await creerReservationRdv(supabase, {'))
    const fn = wh.slice(wh.indexOf('async function refuserApresPaiement('))
    verifie('🔴 le remboursement porte une clé d’idempotence', /idempotencyKey: `yoppaa-refus-\$\{paymentIntent\.id\}`/.test(fn))
    verifie('⚠️ « déjà remboursé » est un succès, toute autre erreur se rejoue',
      /if \(e\?\.code !== 'charge_already_refunded'\) \{\s+throw new Error/.test(fn))
    verifie('🔴 le paiement est marqué pour l’écran de retour', /paymentIntents\.update\(paymentIntent\.id, \{ metadata: \{ yoppaa_refus:/.test(fn))
    verifie('🔴 la commande de produits est libérée, stock compris', /if \(avecProduits\) await handlePaymentIntentFailed\(paymentIntent, supabase\)/.test(fn))
    verifie('⚠️ la cliente reçoit un email', /emailPlaceNonConfirmee\(\{/.test(fn) && /envoyerAuYopper\(\{/.test(fn))
  }

  // ─── L'écran de retour attend le serveur ──────────────────────────────
  {
    const fs = lireCode('app/api/rdv/from-session/route.js')
    verifie('🔴 sans rendez-vous, le retour demande à Stripe si le paiement a été refusé',
      /intention\.metadata\?\.yoppaa_refus/.test(fs) && /refuse: true/.test(fs))
    const page = lireCode('app/commander/rdv/[slug]/page.js')
    verifie('🔴 au retour de Stripe, l’écran attend avant de dire « confirmé »',
      /_attenteConfirmation: !!sessionId,/.test(page)
      && /\{etape === 4 && rdvCree && !\(rdvCree\._refus \|\| rdvCree\._attenteConfirmation \|\| rdvCree\._confirmationTardive\) && \(/.test(page))
    verifie('🔴 un refus remboursé se dit, avec un geste pour repartir',
      /\} else if \(j\.refuse\) \{/.test(page) && /Ta place n’a pas pu être confirmée/.test(page) && /Choisir un autre horaire/.test(page))
    verifie('⚠️ pas de réponse n’est pas un succès', /_confirmationTardive: true/.test(page))
    verifie('⚠️ et le retour sans récap ne promet plus « c’est bien confirmé »', !/C\\'est bien confirmé/.test(lire('app/commander/rdv/[slug]/page.js')))
  }

  // ─── L'email, exécuté ─────────────────────────────────────────────────
  {
    const { emailPlaceNonConfirmee } = await import('../lib/resend.js')
    const html = emailPlaceNonConfirmee({
      prenom: '<b>Marie</b>', commercantNom: 'Centre <i>Respire</i>', prestation: 'Hatha',
      quand: 'mercredi 7 octobre à 10:00', motif: motifApresPaiement('place_prise'), montant: '4,50 €',
    })
    verifie('🔴 l’email dit le remboursement et son montant', /remboursé intégralement/.test(html) && /4,50 €/.test(html))
    verifie('🔴 ce qui vient de la cliente ou du commerce est échappé',
      !/<b>Marie<\/b>/.test(html) && !/<i>Respire<\/i>/.test(html))
    const sansArgent = emailPlaceNonConfirmee({ prenom: 'Marie', commercantNom: 'Le Bistrologue', motif: 'x', montant: null })
    verifie('⚠️ sans somme prise, on ne parle pas de remboursement',
      !/remboursé/.test(sansArgent) && /Rien n&rsquo;a été débité/.test(sansArgent))
  }
}

// ═══ LE DÉLAI D'ANNULATION D'UN COMMERCE DE SERVICES (03/10) ══════════════
//
// 🔴 IL NE SE RÉGLAIT QUE CHEZ UN RESTAURANT À TABLES, dans l'empreinte. Un
// salon ou une professeure de yoga restaient à 24 heures, et deux écrans le
// disaient faux : Paiements annonçait 24 h sans lire la colonne, l'admin
// changeait un zéro en vingt-quatre.
{
  const DASH = lireCode('app/dashboard/ConfigDashboard.js')
  const fn = DASH.slice(DASH.indexOf('function ReglageDelaiAnnulation('), DASH.indexOf('function ReglageEmpreinte('))
  verifie('le réglage du délai pour les services existe', fn.length > 1500, `${fn.length} caractères`)
  verifie('🔴 un commerce sans tables le voit',
    /\{!\(estTable && prestations\.some\(p => p\.par_couverts === true && p\.actif !== false\)\) && \(\s*<ReglageDelaiAnnulation commercantId=\{commercantId\} commercant=\{commercant\} toast=\{toast\} \/>/.test(DASH))
  verifie('🔴 il écrit la valeur validée, zéro compris, et relit ce qui a pris',
    /\.update\(\{ rdv_delai_annulation_heures: vDelai\.valeur \}\)/.test(fn)
    && /\.select\('rdv_delai_annulation_heures'\)\s*\.maybeSingle\(\)/.test(fn) && /if \(error \|\| !data\)/.test(fn))
  verifie('⚠️ et il annonce le délai avec la règle commune, défaut du métier compris',
    /delaiAnnulationHeures\(\{ \.\.\.commercant, rdv_delai_annulation_heures: vDelai\.valeur \}\)/.test(fn))

  const PAIEMENTS = lireCode('app/dashboard/TabPaiements.js')
  const sel = PAIEMENTS.match(/\.from\('commercants'\)\s*\.select\('([^']*)'\)/)
  verifie('🔴 Paiements lit le délai avant de l’annoncer',
    !!sel && sel[1].split(',').map(s => s.trim()).includes('rdv_delai_annulation_heures'), sel ? sel[1] : 'select introuvable')

  const ADMIN = lireCode('app/admin/ModalEditCommercant.js')
  verifie('🔴 l’admin ne change plus un zéro en vingt-quatre',
    !/rdv_delai_annulation_heures\) \|\| 24/.test(ADMIN) && /rdv_delai_annulation_heures: vDelai\.valeur,/.test(ADMIN))
  verifie('⚠️ ni n’écrit 24 sur un délai jamais réglé',
    /rdv_delai_annulation_heures: commercant\.rdv_delai_annulation_heures \?\? '',/.test(ADMIN))
}

// ═══ PLUS D'« ACOMPTE À RÉGLER SUR PLACE » (Alex, 03/10) ══════════════════
//
// 🔴 « En le payant sur place, ce n'est plus un acompte. » Sans l'acompte en
// ligne, rien n'était demandé ni enregistré (la ventilation le met à zéro), mais
// la fiche affichait « Acompte 30 % à régler sur place · 15,00 € ». Le client
// lisait une avance à verser, la commerçante ignorait qu'elle n'était pas
// demandée.
{
  const FICHE = lireCode('app/commander/rdv/[slug]/page.js')
  verifie('🔴 la liste des prestations ne parle d’acompte que s’il se paie en ligne',
    /\{p\.acompte_pourcent > 0 && acompteEnLigneDispo && \(/.test(FICHE))
  verifie('🔴 la carte du rendez-vous non plus',
    /\{prestationChoisie\.acompte_pourcent > 0 && !seanceSurAbo && acompteEnLigneDispo && \(/.test(FICHE))
  verifie('⚠️ et le mot « sur place » ne qualifie plus jamais un acompte',
    !/acompteEnLigneDispo \? '[^']*' : '(sur place|à régler sur place)'/.test(FICHE) && !/'à régler sur place'/.test(FICHE))
  const { ventilerTunnelRdv: ventiler } = await import('../lib/tunnel-rdv-montants.js')
  verifie('et rien n’est compté comme acompte sans paiement en ligne',
    ventiler({ prixPrestation: 50, acomptePourcent: 30, acompteEnLigne: false }).acompte === 0
    && ventiler({ prixPrestation: 50, acomptePourcent: 30, acompteEnLigne: true }).acompte === 15)

  const DASH = lireCode('app/dashboard/ConfigDashboard.js')
  verifie('🔴 la commerçante sait, en le réglant, si son acompte est vraiment demandé',
    /const acompteEnLigneActif = commercant\?\.rdv_acompte_en_ligne_actif === true && compteEncaisse\(commercant\)/.test(DASH)
    && /Cet acompte n’est pas encore demandé : active « Acompte en ligne » dans l’onglet Paiements/.test(DASH))
  verifie('⚠️ et la liste de ses prestations le dit aussi',
    /\{!acompteEnLigneActif && <span[^>]*> · pas encore demandé<\/span>\}/.test(DASH))
}

// ═══ RÉSULTAT ════════════════════════════════════════════════════════════
console.log(`\nTunnel rendez-vous : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} en échec :`)
  echecs.forEach(e => console.log('   ✕ ' + e))
  process.exit(1)
}
console.log('Tout passe.')
