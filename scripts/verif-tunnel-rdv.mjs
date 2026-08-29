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
  // ⚠️ LA RÉCOMPENSE NE PAIE JAMAIS DE PRODUITS (décision d'Alex, 29/08) :
  // c'est une remise offerte sur un acte, pas un avoir.
  const v = ventilerTunnelRdv({
    prixPrestation: 20, acomptePourcent: 0, acompteEnLigne: false,
    totalProduits: 50, remiseRecompense: 40,
  })
  egal('la récompense est plafonnée à la prestation', v.remiseRecompense, 20)
  egal('les produits restent dus en entier', v.produitsAPayer, 50)
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
  egal('l’acompte suit la prestation nette', v.acompte, 6.25)
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
  verifie(`${nom} : appelle recrediterBon`, /recrediterBon\(/.test(src))
  // ⚠️ ON LIT LE RÉSULTAT : un `await` qu'on n'écoute pas est un espoir.
  verifie(`${nom} : lit le résultat du re-crédit`, /rec\?\.ok|!rec\.ok/.test(src))
  verifie(`${nom} : rend aussi la récompense`, /rendreRecompense\(/.test(src))
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
  // 🔴 LE CLICHÉ DE SESSION PORTE LA VENTILATION : sans elle, l'écran de
  // retour de Stripe ne peut rien dire de ce qui vient d'être payé.
  verifie('le cliché de session porte la ventilation', /ventilation: ventFigee/.test(src))
  verifie('et l’écran de confirmation la lit', /_ventilation/.test(src))
  // ⚠️ UN AVANTAGE NE DOIT PAS S'ÉVAPORER : si le bon annule l'acompte, le
  // rendez-vous basculerait sur l'insertion directe, qui ne débite rien.
  //
  // ⚠️ ON MESURE LA DÉFINITION, pas le nom. Le remplacer par `false` gardait
  // le nom en place, donc la garde verte : deuxième fois dans ce fichier.
  const defAvantage = (src.match(/const avantageUtilise = [^\n]*/) || [''])[0]
  verifie('l’avantage est reconnu depuis le bon ET la récompense',
    /bonChoisi/.test(defAvantage) && /recompenseActive/.test(defAvantage), defAvantage)
  verifie('et le refus dit le geste à faire', /couvre déjà tout/.test(src))
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
  verifie('le détail laisse la place à une ligne unique quand le bon mord',
    /bonSurProduitsCents > 0/.test(src))
  // ⚠️ ET UN PANIER ENTIÈREMENT COUVERT NE PART PAS CHEZ STRIPE POUR RIEN.
  verifie('un total nul est refusé avec le geste à faire', /rien_a_payer/.test(src))
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

// ═══ RÉSULTAT ════════════════════════════════════════════════════════════
console.log(`\nTunnel rendez-vous : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} en échec :`)
  echecs.forEach(e => console.log('   ✕ ' + e))
  process.exit(1)
}
console.log('Tout passe.')
