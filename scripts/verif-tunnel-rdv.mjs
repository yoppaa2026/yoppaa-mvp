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
  // 🔴 CES TROIS GARDES CHERCHAIENT `recrediterBon(`, `rec?.ok` et
  // `rendreRecompense(` DANS LA ROUTE, jusqu'au 30/08 au soir. Elles ont rougi
  // sur du code juste le jour où le geste a déménagé dans un module, et elles
  // seraient restées vertes sur DEUX versions divergentes du même geste : c'est
  // exactement ce qui a produit le défaut qu'elles étaient censées garder.
  //
  // ⚠️ ON MESURE LA DÉLÉGATION, et le CONTENU s'exécute plus bas, section 9.
  verifie(`${nom} : passe le bon du rendez-vous au module`,
    /bonId: rdv\.bon_cadeau_id/.test(src))
  verifie(`${nom} : et sa récompense`, /recompenseId: [^\n]*rdv\.fidelite_recompense_id/.test(src))
  verifie(`${nom} : avec le montant qu'elle valait`,
    /recompenseMontant: [\s\S]{0,120}fidelite_remise/.test(src))
  // ⚠️ ET LA COMMANDE LIÉE PORTE SES PROPRES AVANTAGES depuis que le bon paie
  // les produits : les oublier laisserait la moitié du bon dans le vide.
  verifie(`${nom} : traite les avantages de la commande liée`,
    /commandeLiee\.bon_cadeau_id/.test(src))
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
}
{
  const src = lireCode('app/api/rdv/annuler-commercant/route.js')
  // ⚠️ SÉCURITÉ : cette route rembourse et recrédite. Sans garde, n'importe
  // qui annulerait les rendez-vous de n'importe quel commerçant.
  verifie('la route d’annulation commerçant est gardée', /gardeSurLigne\(request/.test(src))
  verifie('et le refus est rendu, pas ignoré', /refus\(verdict, NextResponse\)/.test(src))
  // ⚠️ IDEMPOTENCE : un rejeu ne rembourse pas deux fois.
  verifie('un rendez-vous déjà annulé ne rembourse pas une seconde fois',
    /already_canceled/.test(src))
  verifie('et un remboursement déjà fait non plus', /!rdv\.stripe_refund_id/.test(src))
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
  verifie('il recrédite le bon du rendez-vous',
    /recrediterBon\(supabase, rdv\.bon_cadeau_id/.test(finBloc))
  verifie('il rend la récompense du rendez-vous',
    /rdv\.fidelite_recompense_id/.test(finBloc))
  verifie('et il traite toujours la commande', /from\('commandes'\)/.test(finBloc))
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
  verifie('la part produits vit sur la commande', /bon_cadeau_montant: vent\.bonSurProduits/.test(src))
  verifie('la part prestation part dans les métadonnées du rendez-vous',
    /bon_cadeau_montant: String\(vent\.bonSurPresta\)/.test(src))
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
  verifie('« couvert » se déduit du total ET d’un avantage réel',
    /totalCents === 0/.test(defCouvert)
    && /bonCadeau/.test(defCouvert) && /recompense/.test(defCouvert), defCouvert)
  verifie('et il n’est jamais reçu du navigateur',
    !/couvertSansPaiement\s*[,}]/.test(src.split('const body =')[1]?.split('}')[0] || ''))
  verifie('le rendez-vous se crée alors côté serveur',
    /if \(couvertSansPaiement\) \{/.test(src) && /creerReservationRdv\(supabase, \{/.test(src))
  // ⚠️ ET LES DEUX MOUVEMENTS DU BON PARTENT, un par cible : la contrainte
  // `bons_cadeaux_mouvements_une_cible` interdit un mouvement qui désignerait
  // les deux à la fois.
  verifie('le bon est débité sur la prestation ET sur les produits',
    /debiterBon\(supabase, bonCadeau\.id, vent\.bonSurPresta, \{ source: 'rdv'/.test(src)
    && /debiterBon\(supabase, bonCadeau\.id, vent\.bonSurProduits, \{ source: 'commande'/.test(src))
  // ⚠️ ET ON REND CE QU'ON VIENT DE PRENDRE si le second débit échoue : laisser
  // la part prestation dépensée ferait perdre de l'argent au porteur du bon
  // pour une réservation qui n'a pas eu lieu.
  verifie('un second débit raté recrédite le premier',
    /recrediterBon\(supabase, bonCadeau\.id, vent\.bonSurPresta, \{ rdv_id: idRdv \}\)/.test(src))
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

  function baseSimulee({ prestation, lieux = [], placesPrises = [], erreurInsert = null }) {
    const vu = { payload: null, filtresPlaces: {} }
    const table = (nom) => {
      const filtres = {}
      const chaine = {
        select: () => chaine,
        eq: (col, val) => { filtres[col] = val; return chaine },
        in: (col, val) => { filtres[col] = val; return chaine },
        is: () => chaine,
        maybeSingle: async () => ({
          data: nom === 'rdv_prestations' ? prestation
            : nom === 'commercants' ? { id: 'c1', nom: 'Ciseaux et Soins', adresse: 'Rue du Siège 1' }
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
          : nom === 'rdv_reservations' ? (vu.filtresPlaces = filtres, { data: placesPrises.map(place_no => ({ place_no })) })
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

  // ── LE LIEU GRAVÉ, et le choix explicite qui l'emporte ──────────────────
  {
    const LIEUX = [
      { id: 'L1', type: 'hebdo', jour_semaine: 'lundi', libelle: 'Salle du Centre', adresse: 'Place 3', heure_debut: '18:00', heure_fin: '21:00', actif: true },
      { id: 'L2', type: 'hebdo', jour_semaine: 'lundi', libelle: 'Salle des Fêtes', adresse: 'Rue Haute 9', heure_debut: '09:00', heure_fin: '12:00', actif: true },
    ]
    const db = baseSimulee({ prestation: PRESTA_COURS, lieux: LIEUX })
    await creerReservationRdv(db, {
      commercantId: 'c1', prestationId: 'p2',
      dateRdv: '2026-09-07', heureDebut: '18:30', lieuId: 'L2', champs: {},
    })
    // 🔴 SANS CE CHOIX, LA CONFIRMATION ENVOIE AU SIÈGE SOCIAL, donc au domicile
    // d'une commerçante inscrite chez elle mais qui donne cours en salle.
    verifie('le lieu explicite de la plage l’emporte sur l’heure',
      db._vu.payload.lieu_id === 'L2' && db._vu.payload.lieu_libelle === 'Salle des Fêtes')
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
  verifie('et le bon est rechargé en base', /chargerBonValide\(db, \{ code: codeBon/.test(src))
  // ⚠️ LE CRÉNEAU EST REVÉRIFIÉ CÔTÉ SERVEUR : passé, jour de fermeture, pause.
  // ⚠️ L'HEURE MURALE BELGE, jamais l'horloge du serveur : Vercel tourne en
  // temps universel, et un rendez-vous d'hier matin passerait.
  verifie('un créneau déjà passé est refusé',
    /brusselsInstant\(date_rdv, heure\)/.test(src) && /instant\.getTime\(\) <= Date\.now\(\)/.test(src))
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
  verifie('la ligne de bon cadeau est bien conditionnée à son montant',
    /\{remiseBon > 0 && \([\s\S]{0,600}Ton bon cadeau/.test(recap))
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
  const { rendreAvantagesRdv } = await import('../lib/rdv-annulation-server.js')

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
      bonId: 'b1', bonMontant: 40, recompenseId: 'r1', recompenseMontant: 10,
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
        bonId: 'b1', bonMontant: 40, recompenseId: 'r1', recompenseMontant: 10,
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
      bonId: null, bonMontant: 0, recompenseId: 'inconnue', recompenseMontant: 10,
      refs: { rdv_id: 'rdv1' },
    })
    egal('une récompense introuvable n’annonce rien', rendu.recompense, 0)
    egal('et sans bon, rien non plus', rendu.bon, 0)
    verifie('aucun mouvement écrit', db._vu.mouvements.length === 0)
  }
  {
    const db = baseAvantages({ recompense: { id: 'r1', carte_id: 'ca1', utilisee_at: 'x' } })
    const rendu = await rendreAvantagesRdv(db, {
      bonId: 'b1', bonMontant: 0, recompenseId: null, refs: { rdv_id: 'rdv1' },
    })
    egal('un bon à zéro ne s’annonce pas', rendu.bon, 0)
    egal('et une récompense non demandée non plus', rendu.recompense, 0)
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
  verifie('et dit quand il l’efface entièrement',
    /couvre déjà ton acompte/.test(ecran) && /ventBon\.acompte === 0/.test(ecran))
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
  verifie('sans argent, la fenêtre le dit simplement',
    /n’a rien avancé/.test(nu.message) && !/€/.test(nu.message), nu.message)

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
  const html = emailRdvNoShow({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins',
    prestation_nom: 'Coupe', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: false, acompte_montant: 0, bon_cadeau_montant: 40,
  })
  verifie('le no-show dit que le bon reste chez le commerçant',
    html.includes('40,00') && /bon cadeau/.test(html))
  const rien = emailRdvNoShow({
    yopper_prenom: 'Alexandre', commercant_nom: 'X',
    prestation_nom: 'Coupe', date_rdv: '2026-09-02', heure_debut: '15:30',
    acompte_paye: false, acompte_montant: 0,
  })
  verifie('et sans argent engagé, aucun bloc ne s’invente',
    !/reste chez le commerçant/i.test(rien))
  // ⚠️ ET LA ROUTE CHARGE LA COLONNE. Sans elle, `Number(undefined || 0)` vaut
  // zéro, la ligne disparaît, et rien ne lève.
  //
  // 🔴 MA PREMIÈRE VERSION CHERCHAIT `bon_cadeau_montant,` N'IMPORTE OÙ dans le
  // fichier : le nom apparaît AUSSI dans l'argument passé au gabarit, donc
  // retirer la colonne du select laissait la garde verte. Le harnais de
  // mutation l'a dit. C'est la quatrième fois de la semaine que je copie un MOT
  // au lieu d'isoler l'endroit où la RÈGLE s'applique.
  const route = lireCode('app/api/emails/rdv-no-show/route.js')
  const selectNoShow = (route.match(/\.select\(`([^`]*)`\)/) || ['', ''])[1]
  verifie('le select du no-show charge le bon cadeau',
    /bon_cadeau_montant/.test(selectNoShow), selectNoShow.slice(0, 160))
  verifie('et la route le passe au gabarit',
    /bon_cadeau_montant: rdv\.bon_cadeau_montant/.test(route))
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

// ═══ RÉSULTAT ════════════════════════════════════════════════════════════
console.log(`\nTunnel rendez-vous : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} en échec :`)
  echecs.forEach(e => console.log('   ✕ ' + e))
  process.exit(1)
}
console.log('Tout passe.')
