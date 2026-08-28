// BANC : LE BON CADEAU, DE BOUT EN BOUT (28/08).
//
// ⚠️ CE BANC RÉPOND À CE QU'ALEX A VU EN PRODUCTION : « ils apparaissent dans
// le tableau de bord du commerçant mais rien côté Yopper ». La mesure a démenti
// mes deux premières hypothèses, et c'est la leçon du jour :
//   • les emails PARTAIENT, ils ont REBONDI (adresse en `.col`, boîte
//     inexistante). Lire le retour de l'envoi n'y aurait rien changé : Resend
//     accepte, puis le rebond arrive de façon asynchrone ;
//   • la page `/cadeau/<token>` EXISTAIT, bien faite. Elle était ORPHELINE :
//     aucun écran de l'application n'y menait.
//
// CE QUI EST GARDÉ ICI :
//   • la règle d'argent, EXÉCUTÉE, des deux côtés du comptoir ;
//   • l'ordre récompense puis bon, jamais l'inverse ;
//   • les DEUX tunnels de rendez-vous, parce que le 27/08 un seul des deux
//     connaissait la fidélité et que l'écran a promis ce que le serveur n'a
//     pas tenu ;
//   • la sécurité de `mes-bons` : l'adresse vient de la SESSION, jamais d'un
//     paramètre.
//
//   npm run verif:bons

import { readFileSync } from 'node:fs'
import { euros, eurosNus } from '../lib/montants.js'
import { elisionDe } from '../lib/francais.js'
import { calculerRemiseBon, normaliserCodeBon, bonExpire } from '../lib/bons-cadeaux.js'
import { resteAEncaisser, soldeRdv, etatPaiementRdv, caDesRdvs, montantNetCommande, phraseAvantages } from '../lib/rdv-paiement.js'
import { emailRdvConfirme, emailNouveauRdvCommercant, emailBonCadeauBeneficiaire } from '../lib/resend.js'
import { texteBonVendu } from '../lib/bons-vendus.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Le code SANS sa prose : une garde a déjà été verte grâce au commentaire qui
// EXPLIQUE la règle au lieu du code qui l'applique. Huit fois depuis le 19/08.
const lireCode = (chemin) => lire(chemin)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

// ═══ 1) LE MONTANT S'ÉCRIT À LA VIRGULE ═══════════════════════════════════
//
// ⚠️ 37 MONTANTS SUR 39 S'ÉCRIVAIENT AU POINT dans la bibliothèque d'emails,
// et les 31 du tunnel de commande aussi. Ce n'était pas un défaut des bons
// cadeaux : c'était tout le produit.
{
  egal('50 s\'écrit 50,00 €', euros(50), `50,00\u00A0€`)
  egal('12,5 s\'écrit 12,50 €', euros(12.5), `12,50\u00A0€`)
  egal('la version nue n\'a ni espace ni symbole', eurosNus(7), '7,00')
  // ⚠️ MÊME COMPORTEMENT QUE L'ANCIEN `Number(x).toFixed(2)` : `null` vaut 0.
  // Changer ça en silence aurait vidé des cellules d'email sur 37 sites.
  egal('null vaut zéro, comme avant', euros(null), `0,00\u00A0€`)
  egal('et undefined ne rend plus « NaN € »', euros(undefined), `0,00\u00A0€`)
}

// ═══ 2) LA RÈGLE D'ARGENT, EXÉCUTÉE ═══════════════════════════════════════
{
  egal('un bon de 50 € sur 20 € ne retire que 20 €', calculerRemiseBon(50, 20), 20)
  egal('un bon de 10 € sur 30 € retire 10 €', calculerRemiseBon(10, 30), 10)

  // ⚠️ CÔTÉ CLIENT, LE BON SE RETRANCHE : sur CETTE commande il n'a pas sorti
  // cet argent-là. Le compte affichait le tarif plein, quatre fois.
  egal('la commande coûte au client 26 € et non 36 €',
    montantNetCommande({ total: 36, fidelite_remise: 5, bon_cadeau_montant: 5 }), 26)
  egal('sans avantage, le net est le total',
    montantNetCommande({ total: 36 }), 36)
  // ⚠️ ON PRÉSERVE LE NULL : `Number(null)` vaut 0 et passerait les gardes.
  egal('un total illisible reste inconnu, jamais zéro',
    montantNetCommande({ total: null }), null)
  egal('et le net ne descend jamais sous zéro',
    montantNetCommande({ total: 10, bon_cadeau_montant: 30 }), 0)
}

// ═══ 3) LE RENDEZ-VOUS CONNAÎT LE BON (28/08) ═════════════════════════════
//
// Un commerce de service PEUT vendre des bons cadeaux ; son bénéficiaire
// arrivait pourtant dans un cul-de-sac.
{
  const RDV = { prix_estime: 40, fidelite_remise: 10, bon_cadeau_montant: 20, acompte_montant: 0 }
  egal('reste à encaisser : 40 − 10 − 20 = 10', resteAEncaisser(RDV), 10)
  egal('et le solde annoncé au client dit le même chiffre', soldeRdv(RDV), 10)

  // ⚠️ L'ACOMPTE PAYÉ SE DÉDUIT EN PLUS, et seulement s'il a été payé.
  egal('acompte payé de 2,50 € : il reste 7,50 €',
    soldeRdv({ ...RDV, acompte_montant: 2.5, acompte_paye: true }), 7.5)
  egal('acompte PRÉVU mais non payé : il reste 10 €',
    soldeRdv({ ...RDV, acompte_montant: 2.5, acompte_paye: false }), 10)

  // ⚠️ LA PHRASE DU COMMERÇANT DIT LE MÊME MONTANT que le calcul. Le 27/08,
  // le calcul retranchait et la phrase se taisait.
  const etat = etatPaiementRdv({ ...RDV, statut: 'confirme' })
  verifie('l\'agenda ne réclame que 10 €', /10,00[\s\u00A0]€/.test(etat.libelle), etat.libelle)
  verifie('et il ne réclame jamais 40 €', !/40,00[\s\u00A0]€/.test(etat.libelle), etat.libelle)
  verifie('la phrase nomme le bon cadeau',
    /bon cadeau/i.test(`${etat.libelle} ${etat.detail || ''}`), etat.detail)

  // ⚠️ ET LE PIÈGE DU NULL, quatre fois rencontré sur ce projet.
  egal('une prestation sans prix reste inconnue',
    soldeRdv({ prix_estime: null, bon_cadeau_montant: 20 }), null)
}

// ═══ 4) 🔴 LA RÈGLE QUI S'INVERSE SELON QUI REGARDE ═══════════════════════
//
// ⚠️ CÔTÉ COMMERÇANT, LE BON NE SE RETRANCHE PAS : c'est de l'argent DÉJÀ
// encaissé le jour de sa vente. Le retrancher du chiffre d'affaires
// reviendrait à ne jamais compter cette vente-là. La récompense, elle, se
// retranche des deux côtés : personne ne l'a jamais payée.
{
  const ca = caDesRdvs([{ prix_estime: 40, fidelite_remise: 10, bon_cadeau_montant: 20, statut: 'honore' }])
  egal('le CA du commerçant vaut 30 €, pas 10 €', ca.encaisse, 30)

  const phrase = phraseAvantages({ fidelite_remise: 10, bon_cadeau_montant: 20 })
  verifie('et la phrase nomme les deux avantages',
    /récompense fidélité/.test(phrase) && /bon cadeau/.test(phrase), phrase)
  egal('sans avantage, aucune phrase', phraseAvantages({}), null)
}

// ═══ 5) LES EMAILS DE RENDEZ-VOUS DISENT LE BON ═══════════════════════════
{
  const base = {
    prenom: 'Alex', commercant_nom: 'Ciseaux et Soins', prestation_nom: 'Coupe',
    date_rdv: '2026-09-10', heure_debut: '10:00', heure_fin: '11:00',
    prix_estime: 40, acompte_paye: true, acompte_montant: 2.5,
    fidelite_remise: 10, bon_cadeau_montant: 20,
  }
  const html = emailRdvConfirme(base)
  verifie('l\'email client nomme le bon cadeau', /Bon cadeau/.test(html))
  verifie('et en annonce les 20,00 €', /20,00[\s\u00A0]€/.test(html))
  // ⚠️ 40,00 € DOIT APPARAÎTRE : c'est le TARIF de la prestation, et il ne se
  // réécrit pas. Ma première garde l'interdisait bêtement. Ce qu'il faut
  // vérifier, c'est que la ligne du SOLDE, elle, dit 7,50 € et pas 40,00 €.
  verifie('le tarif de la prestation reste affiché', /40,00[\s\u00A0]€/.test(html))
  verifie('mais le solde sur place dit 7,50 €',
    /Solde sur place[\s\S]{0,300}?7,50[\s\u00A0]€/.test(html))
  verifie('et la récompense est annoncée à −10,00 €', /−10,00[\s\u00A0]€/.test(html))
  // ⚠️ AUCUN MONTANT AU POINT nulle part dans le rendu.
  verifie('et aucun montant au point', !/\d\.\d{2}\s*€/.test(html))

  const htmlPro = emailNouveauRdvCommercant({ ...base, nom_commercant: 'Ciseaux et Soins' })
  verifie('l\'email commerçant nomme aussi le bon', /Bon cadeau/.test(htmlPro))
  verifie('et aucun montant au point non plus', !/\d\.\d{2}\s*€/.test(htmlPro))
}

// ═══ 6) L'EMAIL DU BÉNÉFICIAIRE DIT DE QUI VIENT LE CADEAU ════════════════
//
// ⚠️ Les prénoms n'étaient exigés nulle part : sans eux, on recevait 50 € de
// la part de personne.
{
  const html = emailBonCadeauBeneficiaire({
    beneficiaire_prenom: 'Alex', acheteur_prenom: 'Carole',
    commercant_nom: 'La Boutique Témoin', montant: 50, code: 'BC-3QJN-J5G9', token: 'tok',
  })
  verifie('le donateur est nommé', /Carole/.test(html))
  verifie('le montant s\'écrit à la virgule', /50,00[\s\u00A0]€/.test(html) && !/50\.00/.test(html))

  const modale = lireCode('app/commander/BonCadeauModal.js')
  verifie('l\'écran exige le prénom de l\'acheteur', /prenomOk\(acheteur\.prenom\)/.test(modale))
  verifie('et celui du bénéficiaire quand on offre', /prenomOk\(benef\.prenom\)/.test(modale))
  // ⚠️ UNE GARDE D'ÉCRAN N'EST JAMAIS UNE RÉPONSE.
  const achat = lireCode('app/api/bons-cadeaux/checkout/route.js')
  // ⚠️ LA CONDITION ENTIÈRE, pas seulement le nom de la variable : une garde
  // qui cherche `acheteur_prenom` reste verte devant `if (false && ...)`.
  verifie('et le SERVEUR refuse aussi un cadeau anonyme',
    /if \(!String\(acheteur_prenom \|\| ''\)\.trim\(\)\) \{/.test(achat))
  verifie('et le prénom du bénéficiaire quand on offre',
    /if \(modeDest === 'offrir' && !String\(beneficiaire_prenom \|\| ''\)\.trim\(\)\) \{/.test(achat))
}

// ═══ 7) 🔴 SÉCURITÉ DE `mes-bons` ═════════════════════════════════════════
//
// ⚠️ L'ADRESSE VIENT DE LA SESSION, JAMAIS D'UN PARAMÈTRE. Lire une adresse
// envoyée par l'appelant offrirait les bons de n'importe qui à quiconque en
// tape l'adresse.
{
  const route = lireCode('app/api/yopper/mes-bons/route.js')
  verifie('l\'identité est PROUVÉE', /identiteProuvee\(request\)/.test(route))
  verifie('l\'adresse ne vient jamais du corps de la requête',
    !/body\??\.\s*email/.test(route) && !/body\.beneficiaire_email/.test(route))
  // ⚠️ PAS DE `.or()` CONCATÉNÉ : une adresse à partie locale entre guillemets
  // peut légalement contenir une virgule, et se mêlerait à la SYNTAXE du filtre.
  verifie('le filtre n\'interpole pas l\'adresse dans une chaîne', !/\.or\(/.test(route))
  verifie('les deux branches sont couvertes (offert ET pour soi)',
    /beneficiaire_email/.test(route) && /destinataire_mode/.test(route))
  // ⚠️ NULL N'EST NI ÉGAL NI DIFFÉRENT : un `.gte()` sur une colonne nulle
  // EXCLUT la ligne. Un bon sans expiration aurait disparu de son écran.
  verifie('un bon sans date d\'expiration reste visible',
    /!b\.expires_at \|\|/.test(route))
  verifie('et aucune adresse email ne ressort de l\'API',
    !/acheteur_email,/.test(route.split('const CHAMPS')[1] || ''))
}

// ═══ 8) LES DEUX TUNNELS DE RENDEZ-VOUS, ET C'EST LE POINT ════════════════
//
// 🔴 LE 27/08, UN SEUL DES DEUX CONNAISSAIT LA FIDÉLITÉ. L'écran annonçait
// 30,90 €, le serveur encaissait 33,90 €. Ajouter le bon à un seul tunnel
// aurait recréé exactement ce défaut dès qu'un produit accompagne le
// rendez-vous.
{
  for (const [nom, chemin] of [
    ['acompte seul', 'app/api/stripe/checkout/create-rdv-acompte/route.js'],
    ['avec produits', 'app/api/stripe/checkout/create-rdv-commande/route.js'],
  ]) {
    const src = lireCode(chemin)
    verifie(`tunnel ${nom} : lit le code envoyé`, /bon_cadeau_code/.test(src))
    verifie(`tunnel ${nom} : le REVALIDE côté serveur`, /chargerBonValide\(/.test(src))
    verifie(`tunnel ${nom} : recalcule la remise`, /calculerRemiseBon\(/.test(src))
    // ⚠️ L'ORDRE : la récompense d'abord, le bon ensuite. Dans l'autre sens,
    // le porteur du bon brûlerait du solde sur une part déjà offerte.
    //
    // ⚠️ ANCRÉE SUR L'APPEL LUI-MÊME, et pas sur le mot `baseApresRecompense` :
    // ce mot est aussi le nom de la variable, donc il survivait à la mutation
    // qui calculait la remise sur `prixBase`. Garde verte parce que le mot
    // existe AILLEURS, pour la cinquième fois sur ce projet. Mesuré, pas relu.
    verifie(`tunnel ${nom} : le bon s'applique APRÈS la récompense`,
      /calculerRemiseBon\(bonCadeau\.solde, baseApresRecompense\)/.test(src))
    verifie(`tunnel ${nom} : transmet le bon au webhook`,
      /bon_cadeau_id: String\(bonCadeau\.id\)/.test(src))
  }

  // ⚠️ ET L'ÉCRAN N'ENVOIE QUE LE CODE, jamais le montant : le 27/08, les DEUX
  // CÔTÉS étaient muets, d'où l'absence totale d'erreur.
  const ecran = lireCode('app/commander/rdv/[slug]/page.js')
  // ⚠️ DEUX FOIS, ET ON LES COMPTE. L'écran a DEUX appels de paiement, un par
  // tunnel. Se contenter d'« au moins une occurrence » laissait passer la
  // mutation qui n'en cassait qu'un : exactement le défaut du 27/08, où un
  // seul des deux tunnels connaissait la fidélité.
  const envois = (ecran.match(/bon_cadeau_code: bonChoisi\.code/g) || []).length
  egal('l\'écran envoie le code du bon dans les DEUX tunnels', envois, 2)
  verifie('et n\'envoie AUCUN montant de bon', !/bon_cadeau_montant:/.test(ecran))
}

// ═══ 9) LE WEBHOOK FIGE ET DÉBITE ═════════════════════════════════════════
{
  const wh = lireCode('app/api/stripe/webhook/route.js')
  verifie('le rendez-vous naît avec son bon',
    /bon_cadeau_id: meta\.bon_cadeau_id/.test(wh))
  verifie('et avec le montant figé',
    /bon_cadeau_montant: Number\(meta\.bon_cadeau_montant\)/.test(wh))
  // ⚠️ ANCRÉE SUR LE COUPLE, et pas sur `source: 'rdv'` seul : la consommation
  // de la RÉCOMPENSE porte exactement la même chaîne quinze lignes plus haut.
  // La garde restait donc verte alors que le débit passait en « commande ».
  verifie('le bon est débité avec la source « rdv »',
    /source: 'rdv',\s*rdv_id: rdvId/.test(wh))
  // ⚠️ UN `await` DONT ON NE LIT PAS LE RÉSULTAT EST UN ESPOIR, PAS UNE
  // ACTION. Ici, le silence coûterait de l'argent réel.
  verifie('et le résultat du débit est LU', /if \(!deb\?\.ok\)/.test(wh))

  // Le contrat de `recrediterBon` a changé : les DEUX appelants ont été relus.
  const srv = lireCode('lib/bons-cadeaux-server.js')
  verifie('recrediterBon refuse l\'ancienne forme au lieu de l\'ignorer',
    /typeof refs === 'string'/.test(srv))
  for (const chemin of ['app/api/commande/cancel/route.js', 'app/api/stripe/webhook/route.js']) {
    verifie(`${chemin.split('/').slice(-2).join('/')} passe un objet`,
      /recrediterBon\(supabase, [^)]*\{ commande_id/.test(lireCode(chemin)))
  }
}

// ═══ 10) LA COLONNE DOIT ARRIVER JUSQU'AUX GABARITS ═══════════════════════
//
// ⚠️ LE DÉFAUT LE PLUS FRÉQUENT DU PROJET : sans la colonne dans le select, la
// règle la plus juste reste sans effet, EN SILENCE (`Number(undefined || 0)`
// vaut 0).
{
  for (const chemin of ['app/api/stripe/webhook/route.js', 'app/api/emails/rdv-confirme/route.js']) {
    const src = lire(chemin)
    verifie(`${chemin.split('/').slice(-2).join('/')} charge la colonne`,
      /fidelite_remise, bon_cadeau_montant/.test(src))
    verifie(`${chemin.split('/').slice(-2).join('/')} la passe aux gabarits`,
      /bon_cadeau_montant:\s+rdv\.bon_cadeau_montant/.test(src))
  }
}

// ═══ 11) L'ÉCRAN DU COMMERÇANT ET LE CODE ═════════════════════════════════
{
  egal('un code se normalise depuis une saisie libre',
    normaliserCodeBon('bc 3qjn j5g9'), 'BC-3QJN-J5G9')
  egal('et une saisie qui n\'est pas un code rend null',
    normaliserCodeBon('bonjour'), null)
  verifie('un bon échu est expiré',
    bonExpire({ expires_at: '2020-01-01T00:00:00Z' }))
  verifie('un bon sans date ne l\'est jamais', !bonExpire({ expires_at: null }))

  const txt = texteBonVendu({ montant_initial: 50 })
  verifie('le commerçant lit 50,00 €', /50,00[\s\u00A0]€/.test(txt.corps))
  verifie('et sans montant lisible, on n\'invente pas un zéro',
    !/0,00/.test(texteBonVendu({}).corps))
}

// ═══ 12) LA FICHE ET LE PAIEMENT MONTRENT LE BON ══════════════════════════
{
  const fiche = lireCode('app/commander/BonCadeauFiche.js')
  verifie('la fiche dit ce qu\'on peut dépenser ici', /à dépenser ici/.test(fiche))
  verifie('elle donne le code', /premier\.code/.test(fiche))
  verifie('et l\'échéance', /echeance/.test(fiche))

  for (const chemin of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    const src = lireCode(chemin)
    verifie(`${chemin.split('/')[2]} : la fiche interroge mes bons`,
      /yopper\/mes-bons/.test(src))
    // ⚠️ `fetchYopper`, PAS `fetch` : un fetch nu n'emporte pas le jeton, et
    // l'écran resterait muet sans la moindre erreur. C'est l'oubli qui a rendu
    // la carte de fidélité aveugle pendant deux jours.
    verifie(`${chemin.split('/')[2]} : avec le jeton`,
      /fetchYopper\('\/api\/yopper\/mes-bons'/.test(src))
    verifie(`${chemin.split('/')[2]} : et affiche l'encart`,
      /<BonCadeauFiche/.test(src))
  }

  // ⚠️ AUCUNE GARDE SUR `bons_cadeaux_actif` : un commerçant peut avoir fermé
  // la vente après avoir vendu, ces bons-là restent dépensables.
  const tunnel = lireCode('app/commander/[slug]/page.js')
  verifie('le bouton « Utiliser » ne dépend pas de la vente encore ouverte',
    /\{!bonApplique && mesBonsIci\.length > 0 &&/.test(tunnel))

  // ⚠️ ET LE COMPTE LES LISTE, sinon perdre l'email reste perdre le bon.
  const compte = lireCode('app/commander/page.js')
  verifie('le compte Yopper charge mes bons', /yopper\/mes-bons/.test(compte))
  verifie('avec le jeton, sinon la liste reste vide en silence',
    /fetchYopper\('\/api\/yopper\/mes-bons'/.test(compte))
  verifie('et chaque bon mène à sa page par jeton',
    /href=\{`\/cadeau\/\$\{b\.token\}`\}/.test(compte))
  // ⚠️ L'ALARME NE SE DÉCLENCHE QUE SI ELLE A UNE RAISON : un bon valable
  // encore onze mois n'a pas besoin d'un compte à rebours.
  verifie('l\'expiration proche est signalée, la lointaine non',
    /jours <= 30/.test(compte))
}

// ═══ 13) 🔴 ON NE REFUSE PAS UN PAIEMENT QUI N'EXISTE PAS ═════════════════
//
// Trouvé par Alex en production le 28/08 : une récompense de 10 € sur un
// panier à 8 € couvre tout, l'écran envoie alors `en_ligne` par défaut, et
// chez un commerçant qui encaisse AU COMPTOIR la commande était refusée avec
// « Le paiement en ligne n'est pas proposé chez ce commerçant ».
//
// ⚠️ CE N'EST PAS LE CONTENU DE LA RÈGLE QUI ÉTAIT FAUX, C'EST SA POSITION :
// elle tombait deux cents lignes avant que le dû soit connu. Une garde de
// contenu n'aurait rien vu. On compare donc des POSITIONS.
{
  const src = lireCode('app/api/stripe/checkout/create-commande/route.js')
  const posCouvert = src.indexOf('const couvertSansPaiement =')
  const posRefus = src.indexOf('Le paiement en ligne n\\\'est pas proposé')
  verifie('le dû est connu AVANT qu\'on refuse un moyen de paiement',
    posCouvert > 0 && posRefus > posCouvert, `couvert@${posCouvert} refus@${posRefus}`)
  verifie('et les trois gardes sautent quand tout est couvert',
    /if \(!couvertSansPaiement\) \{/.test(src))
  // ⚠️ LE SERVEUR CALCULE « couvert », il ne le reçoit pas : sinon il suffirait
  // de l'annoncer pour commander sans payer.
  verifie('« couvert » est calculé par le serveur, jamais reçu',
    !/couvert_sans_paiement/.test(src) && !/body\.couvert/.test(src))
}

// ═══ 14) 🔴 LA VIRGULE, JUSQUE DANS LES SUJETS D'EMAIL ════════════════════
//
// ⚠️ J'AVAIS BALAYÉ LA BIBLIOTHÈQUE ET LE TUNNEL, PAS LES ROUTES. Six montants
// restaient au point, dont DEUX SUJETS d'email lus avant même l'ouverture :
// « Bon cadeau vendu · 25.00 € » et « Abonnement vendu · 38.00 € ». Plus les
// phrases d'annulation de rendez-vous, qui annoncent un remboursement.
//
// « Une amélioration s'applique PARTOUT » : je m'étais arrêté à deux fichiers.
{
  const routes = [
    'app/api/rdv/cancel/route.js',
    'app/api/stripe/checkout/create-commande/route.js',
    'app/api/stripe/webhook/route.js',
  ]
  for (const chemin of routes) {
    const src = lireCode(chemin)
    verifie(`${chemin.split('/').slice(-2).join('/')} n'écrit plus un montant au point`,
      !/toFixed\(2\)/.test(src),
      (src.match(/.*toFixed\(2\).*/) || [])[0])
  }
}

// ═══ CE QUE LA DESTINATAIRE A VRAIMENT VU (28/08, deux vrais emails) ═══════
//
// 🔴 CAROLE NE POUVAIT PAS LIRE SON CODE. Sur le client mail d'un téléphone
// Android, le bloc du bon n'avait pour fond qu'un `linear-gradient`, que ce
// client JETTE. Le fond redevenait blanc, et le montant comme le code, écrits
// en `#fff`, devenaient invisibles. Le bon partait, signé DKIM, inutilisable.
//
// ⚠️ LA GARDE PORTE SUR LA COULEUR DE REPLI, pas sur le dégradé. Un fond sombre
// annoncé UNIQUEMENT par un dégradé est le défaut, où qu'il se trouve.
{
  const src = readFileSync(new URL('../lib/resend.js', import.meta.url), 'utf8')
  const sansRepli = src.split('\n').filter(l => /background:linear-gradient/.test(l))
  verifie('aucun fond d\'email ne repose sur le seul dégradé',
    sansRepli.length === 0,
    sansRepli.length ? `${sansRepli.length} reste(s) : ${sansRepli[0].trim().slice(0, 70)}` : '')

  // Les deux blocs qui portent du texte blanc, nommés un par un : l'entête de
  // TOUS les emails, et le bloc du bon où vivent le montant et le code.
  verifie('l\'entête garde une couleur de repli',
    /background-color:\$\{C\.panel\};background-image:linear-gradient/.test(src))
  verifie('le bloc du bon cadeau garde une couleur de repli',
    /background-color:#160636;background-image:linear-gradient/.test(src))
  verifie('les emails de la landing aussi',
    !/background:linear-gradient/.test(
      readFileSync(new URL('../lib/resend-landing.js', import.meta.url), 'utf8')))

  // 🔴 « LE MOT DE ALEXANDRE », lu dans le vrai email de la destinataire.
  verifie('le mot du donateur s\'élide devant une voyelle', elisionDe('Alexandre') === 'd’Alexandre', elisionDe('Alexandre'))
  verifie('et ne s\'élide pas devant une consonne', elisionDe('Carole') === 'de Carole', elisionDe('Carole'))
  verifie('le h est traité comme une voyelle', elisionDe('Hugo') === 'd’Hugo', elisionDe('Hugo'))
  verifie('un accent en tête compte comme une voyelle', elisionDe('Élise') === 'd’Élise', elisionDe('Élise'))
  verifie('sans prénom, la préposition seule', elisionDe('') === 'de' && elisionDe(null) === 'de')
  // ⚠️ LA FONCTION REND LA PRÉPOSITION : sans ça un appelant écrirait
  // « de ${elisionDe(x)} » et recréerait la faute en croyant l'avoir corrigée.
  verifie('le gabarit ne recolle pas « de » devant', !/Le mot de \$\{/.test(src))

  // 🔴 LES DEUX PRÉNOMS PARTAIENT BRUTS DANS LE HTML, juste à côté d'un
  // `message` échappé depuis le 22/08. Ils viennent de l'ACHETEUR et
  // atterrissent chez un tiers qu'il choisit librement : c'est exactement le
  // cas que le commentaire de sécurité de `resend.js` décrit mot pour mot.
  const piege = emailBonCadeauBeneficiaire({
    beneficiaire_prenom: '<img src=x onerror=alert(1)>',
    acheteur_prenom: '<b>Pirate</b>',
    commercant_nom: 'La Boutique Témoin',
    montant: 50, code: 'ABC123', token: 'jeton', message: 'coucou',
  })
  verifie('le prénom du bénéficiaire est échappé', !/<img src=x/.test(piege))
  verifie('le prénom de l\'acheteur est échappé', !/<b>Pirate<\/b>/.test(piege))
  verifie('et le texte reste lisible plutôt que supprimé', /&lt;b&gt;Pirate/.test(piege))
}

console.log(`\n${ok} vérifications passées, ${echecs.length} en échec.`)
if (echecs.length) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log(`  ✕ ${e}`))
  process.exit(1)
}
