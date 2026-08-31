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
import { doitMontrerFlottant, SEUIL_CACHER, SEUIL_MONTRER } from '../lib/bouton-flottant.js'
import { calculerRemiseBon, normaliserCodeBon, bonExpire, libelleResteBon, libelleBon, confirmationDepuisBon, ETATS_CONFIRMATION } from '../lib/bons-cadeaux.js'
import { resteAEncaisser, soldeRdv, etatPaiementRdv, caDesRdvs, montantNetCommande, phraseAvantages, etatPaiementClient } from '../lib/rdv-paiement.js'
import { emailRdvConfirme, emailNouveauRdvCommercant, emailBonCadeauBeneficiaire, emailBonCadeauAcheteur, emailBonCadeauVenduCommercant } from '../lib/resend.js'
import { texteBonVendu } from '../lib/bons-vendus.js'
import { sansProse } from './lire-code.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Le code SANS sa prose : une garde a déjà été verte grâce au commentaire qui
// EXPLIQUE la règle au lieu du code qui l'applique. Huit fois depuis le 19/08.
// ⚠️ LE DÉPOUILLEUR EST PARTAGÉ (`scripts/lire-code.mjs`) : il vivait recopié
// dans huit bancs, et le défaut du 29/08 aurait dû être corrigé huit fois.
const lireCode = (chemin) => sansProse(lire(chemin))

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
    // ⚠️ LE CALCUL A DÉMÉNAGÉ LE 29/08 dans `lib/tunnel-rdv-montants.js`, seul
    // endroit du projet où l'on ventile un rendez-vous. Ces deux gardes
    // recopiaient l'appel littéral `calculerRemiseBon(bonCadeau.solde,
    // baseApresRecompense)` : elles sont devenues rouges au déménagement sans
    // qu'aucune règle ne change. Une garde qui suit une FORME casse à chaque
    // refactoring ; celle qui suit la RÈGLE survit.
    //
    // L'ordre récompense puis bon, lui, est EXÉCUTÉ par `verif:tunnel-rdv` :
    // 40 € de prestation, 10 € de récompense, un bon de 100 € → le bon ne paie
    // que 30 €, jamais 40. Ici on garde ce qui est propre à la route : elle
    // délègue, et elle ne recalcule rien dans son coin.
    verifie(`tunnel ${nom} : ventile avec le module unique`, /ventilerTunnelRdv\(/.test(src))
    verifie(`tunnel ${nom} : ne recalcule plus la remise du bon à la main`,
      !/calculerRemiseBon\(/.test(src))
    // ⚠️ ET LE SOLDE DU BON VIENT DE LA BASE, jamais de l'écran : « l'écran
    // calcule, le serveur décide ».
    verifie(`tunnel ${nom} : le solde vient du bon rechargé`,
      /soldeBon: bonCadeau \? Number\(bonCadeau\.solde\) : 0/.test(src))
    verifie(`tunnel ${nom} : transmet le bon au webhook`,
      /bon_cadeau_id: String\(bonCadeau\.id\)/.test(src))
  }

  // ⚠️ ET L'ÉCRAN N'ENVOIE QUE LE CODE, jamais le montant : le 27/08, les DEUX
  // CÔTÉS étaient muets, d'où l'absence totale d'erreur.
  const ecran = lireCode('app/commander/rdv/[slug]/page.js')
  // ⚠️ TROIS FOIS, ET ON LES COMPTE. L'écran a TROIS sorties : l'acompte seul,
  // le tunnel avec produits, et depuis le 30/08 la réservation SANS paiement.
  // Se contenter d'« au moins une occurrence » laissait passer la mutation qui
  // n'en cassait qu'une : exactement le défaut du 27/08, où un seul des deux
  // tunnels connaissait la fidélité.
  const envois = (ecran.match(/bon_cadeau_code: bonChoisi\.code/g) || []).length
  egal('l\'écran envoie le code du bon dans les TROIS sorties', envois, 3)
  // ⚠️ CETTE GARDE CHERCHAIT UN MOT DANS TOUT LE FICHIER, et elle a rougi le
  // 30/08 sur du code juste : l'écran de confirmation AFFICHE désormais
  // `bon_cadeau_montant`, que le serveur vient de lui rendre. Afficher un
  // montant qu'on a reçu et en ENVOYER un ne sont pas le même geste.
  //
  // On isole donc les corps de requête, et on n'y cherche aucun montant. C'est
  // la règle : « l'écran calcule pour montrer, le serveur décide ».
  const corpsEnvoyes = (() => {
    const out = []
    let i = 0
    const marqueur = 'body: JSON.stringify('
    while ((i = ecran.indexOf(marqueur, i)) >= 0) {
      let profondeur = 0, j = i + marqueur.length
      for (; j < ecran.length; j++) {
        if (ecran[j] === '(') profondeur++
        else if (ecran[j] === ')') { if (profondeur === 0) break; profondeur-- }
      }
      out.push(ecran.slice(i, j))
      i = j
    }
    return out
  })()
  verifie('l\'écran a bien des corps de requête à inspecter', corpsEnvoyes.length >= 3,
    `${corpsEnvoyes.length} corps trouvés`)
  verifie('et aucun n\'envoie de montant de bon ni de remise',
    corpsEnvoyes.every(c => !/bon_cadeau_montant/.test(c) && !/fidelite_remise/.test(c)),
    corpsEnvoyes.filter(c => /bon_cadeau_montant|fidelite_remise/.test(c)).length + ' corps fautifs')
}

// ═══ 9) LE WEBHOOK FIGE ET DÉBITE ═════════════════════════════════════════
{
  const wh = lireCode('app/api/stripe/webhook/route.js')
  verifie('le rendez-vous naît avec son bon',
    /bon_cadeau_id: meta\.bon_cadeau_id/.test(wh))
  verifie('et avec le montant figé',
    /bon_cadeau_montant: Number\(meta\.bon_cadeau_montant\)/.test(wh))
  // ⚠️ LE DÉBIT A DÉMÉNAGÉ DANS LE MODULE LE 30/08, avec la consommation de la
  // récompense : les trois chemins qui créent un rendez-vous font désormais les
  // deux gestes par le même appel, au lieu de les réécrire chacun.
  const mod = lireCode('lib/rdv-creation-server.js')
  // ⚠️ ANCRÉE SUR LE COUPLE, et pas sur `source: 'rdv'` seul : la consommation
  // de la RÉCOMPENSE porte exactement la même chaîne quinze lignes plus haut.
  // La garde restait verte alors que le débit passait en « commande ».
  verifie('le bon est débité avec la source « rdv »',
    /source: 'rdv', rdv_id: rdvId/.test(mod))
  // ⚠️ UN `await` DONT ON NE LIT PAS LE RÉSULTAT EST UN ESPOIR, PAS UNE
  // ACTION. Ici, le silence coûterait de l'argent réel.
  verifie('et le résultat du débit est LU', /if \(!deb\?\.ok\)/.test(mod))
  // Et le webhook appelle bien ce module, sinon les deux gardes ci-dessus
  // mesureraient du code que plus personne n'exécute.
  //
  // 🔴 CETTE GARDE A ÉTÉ MESURÉE MUETTE, ET C'EST LA MÊME LEÇON QUE LE 30/08 AU
  // MATIN : elle cherchait `appliquerAvantagesRdv(supabase, {`, donc le NOM de
  // l'appel. Neutraliser l'appel gardait le nom en place, et la garde restait
  // verte. On inspecte donc CE QU'IL TRANSMET : un appel qui passe `null` au
  // lieu du bon reçu de Stripe ne débite rien, et il n'y a pas de plus grande
  // différence que celle-là.
  const appelAvantages = (() => {
    const i = wh.indexOf('appliquerAvantagesRdv(supabase, {')
    return i < 0 ? '' : wh.slice(i, wh.indexOf('\n    })', i))
  })()
  verifie('le webhook applique les avantages par le module', appelAvantages.length > 60,
    `${appelAvantages.length} caractères`)
  verifie('et il lui passe le bon reçu de Stripe, pas un vide',
    /bonCadeauId: meta\.bon_cadeau_id/.test(appelAvantages)
    && /bonMontant: Number\(meta\.bon_cadeau_montant\)/.test(appelAvantages))
  verifie('ainsi que la récompense',
    /recompenseId: meta\.fidelite_recompense_id/.test(appelAvantages))

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

// ═══ LE BOUTON FLOTTANT S'EFFACE QUAND SA CIBLE EST LÀ (Alex, 28/08) ══════
//
// « Est-ce qu'il ne devrait pas disparaître une fois que le bouton recherché
// est visible ? Sinon ça fait un peu doublon. » Oui : un raccourci vers ce
// qu'on regarde déjà n'est plus un raccourci, il cache le bas de l'écran, et
// deux boutons violets à trois centimètres font hésiter.
//
// ⚠️ LA RÈGLE EST EXÉCUTÉE, pas décrite. Une garde qui chercherait le mot
// `IntersectionObserver` dans le source resterait verte avec des seuils
// inversés, donc avec un bouton qui clignote.
{
  // Cible franchement visible → il s'efface, quel que soit l'état d'avant.
  verifie('cible bien visible : le bouton s\'efface', doitMontrerFlottant(0.8, true) === false)
  verifie('et il reste effacé', doitMontrerFlottant(0.8, false) === false)
  // Cible franchement sortie → il revient, quel que soit l'état d'avant.
  verifie('cible sortie : le bouton revient', doitMontrerFlottant(0, false) === true)
  verifie('et il reste affiché', doitMontrerFlottant(0, true) === true)

  // ⚠️ LA BANDE MORTE, ET C'EST TOUT L'INTÉRÊT : entre les deux seuils, on ne
  // change RIEN. Sans elle, un doigt qui bouge d'un millimètre à la frontière
  // ferait apparaître et disparaître le bouton en boucle.
  verifie('entre les deux seuils, un bouton affiché le reste',
    doitMontrerFlottant(0.2, true) === true)
  verifie('entre les deux seuils, un bouton effacé le reste',
    doitMontrerFlottant(0.2, false) === false)
  verifie('les deux seuils sont bien distincts', SEUIL_MONTRER < SEUIL_CACHER)

  // Un ratio absent ne doit jamais faire sauter le bouton d'un état à l'autre.
  verifie('un ratio illisible ne change rien', doitMontrerFlottant(undefined, true) === true
    && doitMontrerFlottant(null, false) === false)

  const src = lireCode('app/commander/[slug]/page.js')
  verifie('le bouton flottant est conditionné à la règle',
    /nbArticlesPanier\(\) > 0 && montrerFlottant &&/.test(src))
  verifie('la décision passe par la fonction, jamais par un test maison',
    /setMontrerFlottant\(avant => doitMontrerFlottant\(entree\.intersectionRatio, avant\)\)/.test(src))
  // ⚠️ PAS D'ÉCOUTEUR DE DÉFILEMENT DE PLUS : c'est la leçon de la zone morte
  // au doigt, trois jours perdus sur un scroll iOS gêné par du code greffé
  // dessus. Il en existe UN seul dans cet écran, antérieur, et il sert à
  // l'entête collante et à la catégorie active. La garde compte donc, elle
  // n'interdit pas : écrite en « aucun », elle rougissait sur du code sain.
  verifie('le seul écouteur de défilement reste celui de l\'entête',
    (src.match(/addEventListener\('scroll'/g) || []).length === 1)
  verifie('l\'observation se fait dans le conteneur qui défile, pas la fenêtre',
    /root: conteneur/.test(src))
  // Sans plusieurs seuils, le navigateur ne rappelle qu'à un point et la bande
  // morte ne serait jamais franchie : le bouton resterait bloqué.
  verifie('les deux seuils sont donnés à l\'observateur',
    /threshold: \[0, SEUIL_MONTRER, SEUIL_CACHER/.test(src))
}

// ═══ « DONT TVA » SE LIT COMME UNE TVA SUR LA LIGNE DU DESSUS ═════════════
//
// 🔴 Alex a entouré ce bloc : au-dessus « Plus rien à payer 0,00 € », en
// dessous « TVA 21 % · 1,39 € ». Le chiffre est JUSTE (un bon cadeau est un
// moyen de paiement, la vente vaut toujours 8 €), c'est la phrase qui manque.
{
  const src = readFileSync(new URL('../lib/resend.js', import.meta.url), 'utf8')
  verifie('le bloc TVA nomme son assiette', /TVA comprise dans les \$\{euros\(/.test(src))
  // ⚠️ L'ASSIETTE VIENT DE LA VENTILATION, PAS DE `total` : avec une
  // récompense la base a été réduite, et annoncer « le total » serait faux
  // d'exactement le montant de la remise.
  verifie('et il la calcule sur les lignes qu\'il chapeaute',
    /TVA comprise dans les \$\{euros\(ventilation_tva\.reduce\(/.test(src))
  verifie('« Dont TVA » seul a disparu',
    !/letter-spacing:0\.6px;border-top:1px solid \$\{C\.pale\};">Dont TVA</.test(src))
}

// ═══ LES MONTANTS DU TUNNEL CLIENT, COLLÉS À LEUR EURO ════════════════════
//
// Sur le même écran, le panier écrivait « 8,00€ » et la barre flottante juste
// en dessous « 8,00 € ». Frère du balayage commerçant du matin.
{
  for (const f of ['app/commander/[slug]/page.js', 'app/commander/page.js',
                   'app/commander/rdv/[slug]/page.js']) {
    const src = lireCode(f)
    const restes = (src.match(/eurosNus\([^\n]*?\)\}\s?€/g) || [])
    verifie(`${f.split('/').slice(-2).join('/')} n'écrit plus un montant à la main`,
      restes.length === 0, restes[0] || '')
  }
}

// ═══ CE QUI RESTE SUR LE BON, ET À QUOI ÇA SERT (30/08) ═══════════════════
//
// 🔴 LA PHRASE S'ARRÊTAIT À « Il restera 18,10 € sur ton bon. » Un solde dont on
// ignore l'usage est un solde qu'on oublie, et un bon oublié est de l'argent que
// le commerçant a encaissé sans jamais revoir le client.
//
// ⚠️ EXÉCUTÉE, pas cherchée : c'est la seule façon de vérifier qu'elle dit
// vraiment ce qu'on croit.
{
  const p = libelleResteBon(18.10, 'Ciseaux et Soins')
  verifie('la phrase donne le montant restant', p.includes(euros(18.10)), p)
  verifie('et nomme le commerce où il est utilisable',
    p.includes('chez Ciseaux et Soins'), p)
  verifie('et dit à quoi il sert', /prochaine fois/.test(p), p)
  // ⚠️ SANS NOM, ELLE DIT QUAND MÊME À QUOI ÇA SERT : le nom peut manquer si la
  // fiche n'est pas encore chargée, la phrase ne doit pas retomber muette.
  const sansNom = libelleResteBon(18.10)
  verifie('sans le nom du commerce, elle reste utile',
    /prochaine fois/.test(sansNom) && !/chez/.test(sansNom), sansNom)
  // ⚠️ RIEN À DIRE SUR UN SOLDE NUL : une phrase sur zéro est du bruit, et
  // « Il restera 0,00 € sur ton bon » se lit comme une erreur.
  verifie('un solde nul ne dit rien', libelleResteBon(0, 'X') === '')
  verifie('un solde négatif non plus', libelleResteBon(-3, 'X') === '')
  verifie('un solde absent non plus', libelleResteBon(null, 'X') === '')
  // ⚠️ L'ESPACE INSÉCABLE : sur un téléphone, « 18,10 € » se coupait en fin de
  // ligne et le « € » tombait seul sur la ligne suivante.
  verifie('le montant garde son espace insécable', /18,10 €/.test(p), p)

  // ⚠️ ET LES DEUX TUNNELS LA LISENT, au lieu de l'écrire chacun de son côté.
  // Elle vivait en deux exemplaires et sous deux formes : « Il restera X sur ton
  // bon. » d'un côté, « · il restera X sur ton bon » de l'autre.
  for (const f of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    const src = lireCode(f)
    verifie(`${f.split('/').slice(-2).join('/')} lit la phrase du module`,
      /libelleResteBon\(/.test(src))
    verifie(`${f.split('/').slice(-2).join('/')} ne la réécrit plus à la main`,
      !/restera \$\{euros/.test(src) && !/restera \$\{/.test(src.replace(/Il te restera[^\n]*/g, '')))
  }
}

// ═══ LE NOM DU BON CHANGE AVEC LE MÉTIER (31/08) ══════════════════════════
//
// 🔴 « Bon cadeau » dit l'intention, pas l'usage. On n'offre pas un paquet de
// frites : on offre un repas, une tarte, de quoi tenir la semaine.
{
  egal('l’alimentaire dit « bon gourmand »', libelleBon('alimentaire'), 'bon gourmand')
  egal('le détail dit « bon cadeau »', libelleBon('detail'), 'bon cadeau')
  egal('les services aussi', libelleBon('vitrine'), 'bon cadeau')
  egal('et un service public également', libelleBon('publique'), 'bon cadeau')

  // 🔴 LA GARDE QUI COMPTE : le repli d'une catégorie INCONNUE.
  //
  // `lib/plans.js` traite une catégorie absente comme de l'alimentaire, parce
  // que c'est le métier historique. Reprendre ce réflexe ici ferait dire « bon
  // gourmand » chez un coiffeur dont la catégorie n'a pas été chargée, et un
  // email part sans qu'on puisse le rattraper.
  for (const absente of [null, undefined, '', '   ']) {
    egal(`🔴 une catégorie absente (${JSON.stringify(absente)}) reste « cadeau »`,
      libelleBon(absente), 'bon cadeau')
  }
  egal('🔴 et une catégorie inconnue aussi', libelleBon('coiffeur'), 'bon cadeau')

  // ⚠️ LA SAISIE N'EST PAS TOUJOURS PROPRE : une majuscule ou une espace en
  // base ne doivent pas faire basculer le mot.
  egal('la casse ne change rien', libelleBon('Alimentaire'), 'bon gourmand')
  egal('les espaces non plus', libelleBon('  alimentaire  '), 'bon gourmand')

  egal('le pluriel se dit', libelleBon('alimentaire', { pluriel: true }), 'bons gourmands')
  egal('et pour les autres', libelleBon('detail', { pluriel: true }), 'bons cadeaux')
  egal('la majuscule aussi', libelleBon('alimentaire', { majuscule: true }), 'Bon gourmand')
  egal('les deux ensemble', libelleBon('detail', { pluriel: true, majuscule: true }), 'Bons cadeaux')

  // ⚠️ ET LE MODULE NE S'APPUIE PAS SUR `estAlimentaire`, dont le repli est
  // l'EXACT INVERSE du nôtre. Les deux fonctions se ressemblent et ne disent
  // pas la même chose : les confondre ferait basculer tous les commerces sans
  // catégorie du mauvais côté, en silence.
  const srcModule = lireCode('lib/bons-cadeaux.js')
  verifie('🔴 le libellé ne s’appuie pas sur `estAlimentaire`',
    !/estAlimentaire/.test(srcModule),
    'son repli traite une catégorie absente comme de l’alimentaire')
}

// ═══ LE BON INVISIBLE QUAND RIEN NE SE PAIE EN LIGNE (30/08) ══════════════
//
// 🔴 Le bloc du bon ne s'affichait QUE si un acompte en ligne était demandé.
// Chez un commerçant qui n'en prend pas, un Yopper avec 40 € de bon cadeau ne
// voyait RIEN et se présentait sans savoir qu'il avait de l'argent à dépenser.
{
  const src = lireCode('app/commander/rdv/[slug]/page.js')

  // 🔴 ET DEPUIS LE 31/08, IL EST ACTIONNABLE, ACOMPTE OU PAS.
  //
  // Le bon n'est pas un paiement, c'est un AVOIR chez ce commerçant : cet argent
  // est déjà versé, déjà chez lui. Les deux raisons de ne pas le débiter sont
  // tombées le 30/08 au soir : la route serveur revalide et débite elle-même, et
  // l'annulation comme le no-show rendent le bon quand la garantie vaut zéro.
  //
  // ⚠️ LES CONDITIONS SONT TESTÉES EN ENTIER, PARENTHÈSE COMPRISE. Sans le
  // « ( » final, ré-insérer `acompteEnLigne` laisserait la garde verte : le
  // texte cherché n'en serait plus qu'un PRÉFIXE.
  const CONDITION_ACTIF = '{mesBonsIci.length > 0 && !seanceSurAbo && prixBase != null && ('
  const CONDITION_INFO = '{mesBonsIci.length > 0 && !seanceSurAbo && prixBase == null && ('
  const debutActif = src.indexOf(CONDITION_ACTIF)
  const debutInfo = src.indexOf(CONDITION_INFO)

  verifie('🔴 le bon est proposé même sans acompte en ligne',
    debutActif >= 0,
    'le bloc actionnable est de nouveau conditionné à l’acompte')
  verifie('🔴 et le repli informatif ne sert plus qu’avant le choix de la prestation',
    debutInfo > debutActif,
    'le bloc informatif a disparu ou passe avant l’actionnable')

  const blocActif = debutActif >= 0 && debutInfo > debutActif ? src.slice(debutActif, debutInfo) : ''
  const blocInfo = debutInfo >= 0 ? src.slice(debutInfo, debutInfo + 2400) : ''
  verifie('les deux blocs sont bien isolés',
    blocActif.length > 800 && blocInfo.length > 300,
    `${blocActif.length} / ${blocInfo.length} caractères`)

  verifie('🔴 le bloc actionnable propose bien de l’utiliser',
    /setBonChoisi\(/.test(blocActif))
  verifie('et le repli, lui, ne débite rien', !/setBonChoisi\(/.test(blocInfo))
  // ⚠️ DEUXIÈME GARDE DE LA JOURNÉE À AVOIR SURVEILLÉ LE MOT. Elle cherchait
  // « sur ton bon cadeau ici. » et a rougi le jour où le libellé s'est mis à
  // suivre le métier, alors que la phrase disait toujours exactement la même
  // chose. Ce qu'elle défend, ce n'est pas le nom du bon : c'est qu'on annonce
  // un MONTANT et qu'on dise qu'il est utilisable ICI. On ancre donc sur ces
  // deux-là, qui ne doivent pas bouger, et on laisse le nom varier.
  verifie('il annonce le solde disponible ici',
    /Tu as \$\{euros\(mesBonsIci\[0\]\.solde\)\}[^`]*\bici\./.test(src))
  verifie('et le geste à faire', /Présente ton code au comptoir/.test(blocInfo))
  // ⚠️ LE CODE SOUS LES YEUX : c'est lui qu'on donne au comptoir, et il ne vit
  // sinon que dans un email reçu il y a trois mois. Il est dans LES DEUX blocs,
  // parce que l'actionnable l'affiche tant que le bon n'est pas retenu.
  verifie('le code du bon est affiché dans le repli', /\{b\.code\}/.test(blocInfo))
  verifie('🔴 et aussi dans le bloc actionnable, tant que le bon n’est pas retenu',
    /: b\.code/.test(blocActif))

  // 🔴 ET LE RÉCAPITULATIF DIT ENFIN CE QU'IL Y A À EMPORTER.
  //
  // « Rien à payer maintenant, tu règles sur place. » ne portait AUCUN montant,
  // et la ligne « Solde à régler sur place » ne s'affiche que si l'on paie aussi
  // en ligne : sur ce chemin, le Yopper ne voyait jamais son chiffre.
  verifie('🔴 le récapitulatif chiffre ce qui reste à régler sur place',
    /tu règles \$\{euros\(surPlace\)\} sur place\./.test(src))
  verifie('et il dit quand le bon a tout couvert',
    /Ton bon couvre tout\./.test(src))
  // ⚠️ ET IL NE LE DIT QUE SI LE BON A RÉELLEMENT DÉDUIT : une séance
  // d'abonnement ne coûte rien pour une tout autre raison.
  verifie('🔴 « ton bon couvre tout » est gardé par une déduction réelle',
    /remiseBon > 0[\s\S]{0,80}Ton bon couvre tout\./.test(src))

  // 🔴 CE QU'ON N'ÉCRIT PAS, ET LA GARDE EXISTE POUR QU'ON NE LE RÉÉCRIVE PAS.
  //
  // « Le reste de ton bon pourra solder ta prestation au comptoir » décrirait un
  // cas IMPOSSIBLE : le bon éteint la prestation avant de déborder sur les
  // produits, donc s'il reste du solde il n'y a plus rien à solder, et s'il
  // reste à payer le bon est vide. Vérifié le 30/08, et écrit ici pour que
  // personne ne le repropose dans trois semaines.
  for (const interdit of ['solder ta presta', 'soldera ta presta', 'solder le reste de ta presta']) {
    verifie(`la phrase impossible « ${interdit} » n’est pas écrite`,
      !src.includes(interdit))
  }
}

// ═══ LE CÂBLAGE DE LA CATÉGORIE, ÉCRAN PAR ÉCRAN ═════════════════════════
//
// 🔴 LE DÉFAUT DE CE CHANTIER N'EST PAS LE MOT, C'EST LA CATÉGORIE. `libelleBon()`
// retombe volontairement sur « cadeau » quand elle est absente : c'est le bon
// repli, mais il rend le défaut MUET. Un composant qui appelle `libelleBon()`
// sans recevoir sa catégorie affiche un texte parfaitement lisible, et faux.
// C'est le motif « colonne absente d'un select », la sixième fois sur ce projet.
//
// La garde tient donc les DEUX bouts du fil : la signature qui reçoit, et
// l'appel qui passe. Casser l'un des deux la fait rougir.
{
  const src = lireCode('app/dashboard/ConfigDashboard.js')

  // Les composants qui nomment le bon sans posséder le commerçant entier :
  // eux doivent déclarer `categorie` et se la voir passer à CHAQUE appel.
  for (const composant of ['TabLivraison', 'TabComptabilite']) {
    const signature = new RegExp(`function ${composant}\\(\\{([^}]*)\\}\\)`).exec(src)
    verifie(`${composant} reçoit la catégorie`,
      !!signature && /\bcategorie\b/.test(signature[1]),
      signature ? `signature : { ${signature[1].trim()} }` : 'composant introuvable')

    // ⚠️ TOUS LES APPELS, PAS LE PREMIER. Une deuxième version d'un écran
    // (mobile, modale) est exactement l'endroit où le fil se coupe sans bruit.
    const appels = src.match(new RegExp(`<${composant}\\b[^>]*/>`, 'g')) || []
    verifie(`${composant} est appelé au moins une fois`, appels.length > 0)
    const muets = appels.filter(a => !/\bcategorie=\{/.test(a))
    verifie(`les ${appels.length} appel(s) de ${composant} passent la catégorie`,
      muets.length === 0, `${muets.length} appel(s) muet(s)`)
  }

  // TabBonsCadeaux, lui, reçoit le commerçant entier : c'est de là qu'il tire
  // la catégorie, et il ne doit plus contenir un seul libellé figé.
  verifie('TabBonsCadeaux lit la catégorie du commerçant',
    /const nomBon = libelleBon\(commercant\?\.categorie\)/.test(src))

  // 🔴 PLUS AUCUN LIBELLÉ GELÉ DANS LES ÉCRANS DU COMMERÇANT. Ce n'est pas une
  // règle de style : chaque littéral restant est un endroit où le frituriste
  // relit « bon cadeau » après qu'on lui a promis le contraire.
  for (const fichier of ['app/dashboard/ConfigDashboard.js', 'app/dashboard/page.js', 'app/signup/page.js']) {
    const restants = (lireCode(fichier).match(/bons? cadeaux?/gi) || [])
    verifie(`aucun libellé figé dans ${fichier}`,
      restants.length === 0, `${restants.length} restant(s) : ${restants.join(', ')}`)
  }

  // ⚠️ ET CE QUI NE VARIE PAS DOIT RESTER TEL QUEL. L'export part chez un
  // comptable qui rapproche des dizaines de dossiers : un intitulé qui change
  // d'un client à l'autre lui coûte du temps sans rien lui apprendre. La
  // frontière est le DESTINATAIRE, et elle est gardée dans les deux sens.
  verifie('l\'export comptable garde le mot canonique',
    /bons? cadeaux?/i.test(lireCode('lib/export-comptable.js')))
  verifie('l\'export comptable n\'appelle pas libelleBon',
    !/libelleBon/.test(lire('lib/export-comptable.js')))
}

// ═══ CÔTÉ YOPPER : LE MOT DU COMMERCE, SAUF QUAND ON NE LE CONNAÎT PAS ═════
//
// 🔴 LA RÈGLE D'ALEX, 31/08, ET ELLE EST PLUS FINE QUE LA MIENNE. Je voulais
// faire suivre le métier partout ; il a vu que la liste « Mes bons » de
// l'accueil MÉLANGE LES COMMERCES. Un bon de la boulangerie et un du coiffeur
// y voisinent : aucun des deux mots ne conviendrait au titre. « Mes bons »
// suffit, parce que le possessif dit tout ce que le titre doit dire, et que le
// métier est déjà nommé sur chaque carte juste en dessous.
//
// D'où DEUX familles d'écrans, et la garde tient les deux :
//   • on connaît le commerce (sa fiche, ses tunnels, la page d'un bon) → le mot
//     suit le métier ;
//   • on ne le connaît pas (liste multi-commerces, écrans d'annulation qui
//     n'ont qu'un jeton, titre d'onglet figé à la construction) → « bon » nu.
//     Un mot vrai partout vaut mieux qu'un mot juste une fois sur deux.
{
  // ⚠️ LE DÉPOUILLEUR NE RETIRE PAS LES COMMENTAIRES DE FIN DE LIGNE (mesuré :
  // `const a = 1  // bons cadeaux` ressort intact). On les écarte donc ici,
  // sinon la garde rougirait sur une phrase que personne ne lit.
  const codeSeul = (chemin) => lireCode(chemin)
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n')

  // 🔴 LE FIL, ENCORE, ET IL M'A REPRIS. Mes deux premières gardes côté Yopper
  // vérifiaient qu'il n'y a plus de libellé figé et que `libelleBon()` est bien
  // appelée. Deux mutations sont passées au travers : retirer `categorie` de la
  // signature de `BonCadeauFiche`, et cesser de la passer à l'appel. Les deux
  // laissent un fichier qui appelle `libelleBon()` sans aucun mot gelé, donc
  // deux gardes vertes, et un encart qui dit « bon cadeau » chez un boulanger.
  // Ce n'est pas une garde de plus : c'est la MÊME règle que pour le tableau de
  // bord, qu'il fallait appliquer ici aussi. Chercher les frères, encore.
  {
    const src = lireCode('app/commander/BonCadeauFiche.js')
    const signature = /function BonCadeauFiche\(\{([^}]*)\}\)/.exec(src)
    verifie('BonCadeauFiche reçoit la catégorie',
      !!signature && /\bcategorie\b/.test(signature[1]),
      signature ? `signature : { ${signature[1].trim()} }` : 'composant introuvable')

    // ⚠️ TOUS LES APPELS : l'encart vit sur les DEUX fiches, produits et
    // rendez-vous, et c'est exactement le genre d'endroit où une seule des deux
    // est mise à jour. Ce projet a déjà connu la phrase écrite en double.
    const appels = []
    for (const f of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
      for (const a of lireCode(f).match(/<BonCadeauFiche\b[^>]*\/>/g) || []) appels.push([f, a])
    }
    verifie('l\'encart est appelé sur les deux fiches', appels.length === 2, `${appels.length} appel(s)`)
    const muets = appels.filter(([, a]) => !/\bcategorie=\{/.test(a))
    verifie(`les ${appels.length} appel(s) de BonCadeauFiche passent la catégorie`,
      muets.length === 0, muets.map(([f]) => f).join(', '))
  }

  // Là où le commerce est connu : plus aucun libellé figé.
  for (const fichier of [
    'app/commander/BonCadeauFiche.js',
    'app/commander/BonCadeauModal.js',
    'app/commander/rdv/[slug]/page.js',
    'app/commander/[slug]/page.js',
    'app/cadeau/[token]/page.js',
  ]) {
    const restants = codeSeul(fichier).match(/bons? cadeaux?/gi) || []
    verifie(`aucun libellé figé dans ${fichier}`,
      restants.length === 0, `${restants.length} restant(s)`)
    verifie(`${fichier} appelle bien libelleBon`, /libelleBon\(/.test(codeSeul(fichier)))
  }

  // 🔴 ET LÀ OÙ ON NE CONNAÎT PAS LE COMMERCE, ON N'INVENTE PAS. Ces trois
  // écrans n'ont aucune catégorie sous la main : ils doivent dire « bon » nu,
  // et surtout ne pas appeler `libelleBon()`, qui rendrait « bon cadeau » chez
  // un boulanger par le jeu du repli. C'est la sur-correction que cette garde
  // interdit.
  const accueil = codeSeul('app/commander/page.js')
  verifie('🔴 la liste multi-commerces dit « Mes bons », sans métier',
    /mesBons\.length > 1 \? 'Mes bons' : 'Mon bon'/.test(accueil))

  for (const [fichier, phrase] of [
    ['app/commander/cancel/page.js', 'Ton paiement, ton bon et ta récompense fidélité te reviennent automatiquement.'],
    ['app/commander/rdv/cancel/page.js', 'Ton acompte, ton bon et ta récompense fidélité te reviennent automatiquement.'],
  ]) {
    const src = codeSeul(fichier)
    verifie(`${fichier} dit « ton bon » sans nommer de métier`, src.includes(phrase))
    verifie(`${fichier} n'appelle pas libelleBon (aucune catégorie sous la main)`,
      !/libelleBon\(/.test(src))
  }

  // ⚠️ CE TITRE EST FIGÉ À LA CONSTRUCTION DU MODULE, avant qu'on sache de quel
  // bon il s'agit : il ne PEUT pas suivre le métier, et c'est écrit ici pour
  // qu'on ne le « corrige » pas dans six mois.
  verifie('le titre d\'onglet de la page d\'un bon reste neutre',
    /title: 'Mon bon · Yoppaa'/.test(codeSeul('app/cadeau/[token]/page.js')))
}

// ═══ LES EMAILS : ON EXÉCUTE LES GABARITS, ON NE LES LIT PAS ══════════════
//
// 🔴 UN EMAIL PART SANS RETOUR POSSIBLE. Sur un écran, un mot faux se corrige
// au déploiement suivant ; dans une boîte mail, il reste. C'est ici que la
// catégorie oubliée coûte le plus cher, et c'est donc ici qu'on exécute au
// lieu de chercher une chaîne : on rend le gabarit et on lit ce qui en sort.
{
  const rendu = (fn, args) => fn({ ...args })

  for (const [metier, attendu, absent] of [
    ['alimentaire', 'bon gourmand', 'bon cadeau'],
    ['detail', 'bon cadeau', 'bon gourmand'],
    [null, 'bon cadeau', 'bon gourmand'],        // catégorie absente : repli
  ]) {
    const nomMetier = metier || 'catégorie absente'

    const html = rendu(emailBonCadeauBeneficiaire, {
      beneficiaire_prenom: 'Camille', acheteur_prenom: 'Alex',
      commercant_nom: 'Chez Test', montant: 50, code: 'BC-AAAA-BBBB', token: 'tok',
      commercant_categorie: metier,
    })
    verifie(`[${nomMetier}] l'email du bénéficiaire dit « ${attendu} »`, html.includes(attendu))
    verifie(`[${nomMetier}] et jamais « ${absent} »`, !html.includes(absent))

    const htmlAch = rendu(emailBonCadeauAcheteur, {
      acheteur_prenom: 'Alex', commercant_nom: 'Chez Test', montant: 50,
      code: 'BC-AAAA-BBBB', token: 'tok', pour_moi: true, commercant_categorie: metier,
    })
    verifie(`[${nomMetier}] l'email de l'acheteur dit « ${attendu} »`, htmlAch.includes(attendu))
    verifie(`[${nomMetier}] et jamais « ${absent} »`, !htmlAch.includes(absent))

    // ⚠️ ET L'EMAIL DU COMMERÇANT AUSSI : c'est lui qu'on veut atteindre en
    // premier, la règle du 31/08 est née de son point de vue.
    const htmlCom = rendu(emailBonCadeauVenduCommercant, {
      nom_commercant: 'Chez Test', montant: 50, acheteur_email: 'a@b.be',
      pour_moi: true, commercant_categorie: metier,
    })
    verifie(`[${nomMetier}] l'email du commerçant dit « ${attendu} »`, htmlCom.includes(attendu))
    verifie(`[${nomMetier}] et jamais « ${absent} »`, !htmlCom.includes(absent))
  }

  // 🔴 ET LE FIL, POUR LA TROISIÈME FOIS DE LA JOURNÉE. Une route qui lit
  // `commercant?.categorie` sans l'avoir demandée dans son `select` reçoit
  // `undefined`, `libelleBon` retombe sur « cadeau », et l'email part. Aucune
  // erreur nulle part : c'est le motif de la colonne absente d'un select, la
  // sixième fois sur ce projet, et le seul endroit sans retour arrière.
  const ROUTES_EMAIL = [
    'app/api/emails/rdv-confirme/route.js',
    'app/api/emails/rdv-annule/route.js',
    'app/api/emails/rdv-no-show/route.js',
    'app/api/emails/commande-confirmee/route.js',
    'app/api/emails/commande-annulee/route.js',
    'app/api/commande/cancel/route.js',
    'app/api/rdv/cancel/route.js',
    'app/api/cron/recap-jour-8h/route.js',
    'app/api/stripe/webhook/route.js',
    'lib/commande-notifs.js',
  ]
  for (const fichier of ROUTES_EMAIL) {
    const src = lireCode(fichier)
    verifie(`${fichier} passe la catégorie au gabarit`,
      /commercant_categorie:|libelleBon\(/.test(src))
    // Le select du commerçant doit charger la colonne, sinon on passe `undefined`.
    const selects = src.match(/commercants?[^\n]*\(([^)]*)\)/g) || []
    const commercantSelects = selects.filter(s => /nom|email|slug/.test(s))
    verifie(`${fichier} demande bien « categorie » dans son select`,
      commercantSelects.length === 0 || commercantSelects.some(s => /\bcategorie\b/.test(s)),
      `aucun des ${commercantSelects.length} select(s) ne la charge`)
  }

  // ⚠️ CE QUI NE VARIE PAS, ET IL FAUT QUE CE SOIT GARDÉ AUSSI : les journaux.
  // Sept lignes du webhook écrivent « bon cadeau » dans la console. Elles sont
  // lues par un développeur qui cherche une trace, dans UN vocabulaire, et un
  // journal au libellé variable se cherche deux fois.
  //
  // ⚠️ ET ON GARDE LA RÈGLE, PAS UN COMPTE. Ma première version comptait les
  // journaux et exigeait « au moins cinq » : retirer le mot d'un seul en
  // laissait six, la garde restait verte, et la mutation l'a montré. Un seuil
  // n'est pas une règle. Ce qu'on interdit vraiment, c'est qu'un journal
  // APPELLE `libelleBon` : c'est le geste qu'un développeur zélé ferait, et
  // c'est lui qui rendrait les traces incherchables.
  for (const fichier of ['app/api/stripe/webhook/route.js', 'lib/rdv-creation-server.js',
                         'lib/rdv-annulation-server.js', 'app/api/commande/cancel/route.js']) {
    const fautifs = (lireCode(fichier).match(/console\.(error|info|warn)\([^\n]*libelleBon\(/g) || [])
    verifie(`aucun journal de ${fichier} n'appelle libelleBon`,
      fautifs.length === 0, `${fautifs.length} journal(aux) fautif(s)`)
  }
}

// ═══ LE MODULE DE PAIEMENT ET LES ROUTES, EXÉCUTÉS ═══════════════════════
//
// 🔴 `lib/rdv-paiement.js` EST LU PAR LES DEUX CÔTÉS À LA FOIS : les écrans du
// Yopper, ceux du commerçant, et les emails. Neuf phrases y nommaient le bon.
// Comme pour les emails, on ne cherche pas une chaîne : on exécute.
{
  const commande = { total: 30, paye_en_ligne: true, bon_cadeau_montant: 30, fidelite_remise: 0 }
  for (const [metier, attendu, absent] of [
    ['alimentaire', 'bon gourmand', 'bon cadeau'],
    ['detail', 'bon cadeau', 'bon gourmand'],
    [null, 'bon cadeau', 'bon gourmand'],
  ]) {
    const nomMetier = metier || 'catégorie absente'

    const phrase = phraseAvantages({ bon_cadeau_montant: 12 }, { categorie: metier })
    verifie(`[${nomMetier}] la phrase des avantages dit « ${attendu} »`, String(phrase).includes(attendu))
    verifie(`[${nomMetier}] et jamais « ${absent} »`, !String(phrase).includes(absent))

    const etat = etatPaiementClient(commande, { categorie: metier })
    const texte = `${etat?.libelle || ''} ${etat?.detail || ''}`
    verifie(`[${nomMetier}] l'état de paiement du client dit « ${attendu} »`, texte.includes(attendu))
    verifie(`[${nomMetier}] et jamais « ${absent} »`, !texte.includes(absent))

    // ⚠️ ET LE CAS OÙ LE BON PAIE TOUT SANS PASSER PAR STRIPE : c'est le SEUL
    // qui nomme le bon dans le LIBELLÉ et pas seulement dans le détail. Ma
    // première série de données ne l'atteignait pas, et une mutation posée
    // exprès sur cette ligne est restée verte : le banc ne mesurait qu'une
    // branche sur deux. Une couverture qui rate une branche est une couverture
    // qui ment.
    const couvert = etatPaiementClient(
      { total: 30, paye_en_ligne: false, bon_cadeau_montant: 30, fidelite_remise: 0 },
      { categorie: metier },
    )
    verifie(`[${nomMetier}] « payé avec ton … » nomme le bon dans son libellé`,
      String(couvert?.libelle || '').includes(attendu), `libellé : « ${couvert?.libelle} »`)
    verifie(`[${nomMetier}] et jamais « ${absent} » dans ce libellé`,
      !String(couvert?.libelle || '').includes(absent))
  }

  // ⚠️ ET LE REPLI RESTE LE REPLI : appelée SANS options, comme avant ce
  // chantier, la fonction doit continuer à rendre le mot canonique. Un module
  // partagé qui casserait ses anciens appelants serait un défaut de plus.
  verifie('sans catégorie, le module garde le mot compris partout',
    String(phraseAvantages({ bon_cadeau_montant: 12 })).includes('bon cadeau'))
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN DE CONFIRMATION APRÈS L'ACHAT (31/08)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 IL N'EXISTAIT PAS, et Alex l'a vu en production : le parcours marchait,
// les emails partaient, le bon arrivait bien dans le profil, mais l'acheteur
// qui revenait de sa banque ne trouvait qu'un bandeau vert d'une ligne. L'app
// ne pouvait rien dire de plus : `?bon=ok` ne portait AUCUN identifiant.
{
  const BASE = {
    montant_initial: 50, solde: 50, statut: 'actif', code: 'BC-7K2M-9XQ4',
    token: 'jeton-abc', expires_at: '2027-08-31T10:00:00.000Z',
    commercant: { nom: 'Le Pain Doré', slug: 'le-pain-dore', categorie: 'alimentaire' },
  }

  // ─── L'ACHAT POUR SOI : le porteur, c'est l'acheteur ──────────────────────
  const moi = confirmationDepuisBon({ ...BASE, destinataire_mode: 'moi' })
  verifie('achat pour soi : la confirmation est rendue', moi.ok === true)
  verifie('achat pour soi : le code est rendu', moi.bon?.code === 'BC-7K2M-9XQ4')
  verifie('achat pour soi : le jeton est rendu', moi.bon?.token === 'jeton-abc')
  verifie('achat pour soi : le montant est rendu', moi.bon?.montant === 50)
  verifie('achat pour soi : aucun prénom de bénéficiaire',
    moi.bon?.beneficiaire_prenom === null)

  // ─── LE CADEAU : le porteur est QUELQU'UN D'AUTRE ─────────────────────────
  //
  // 🔴 C'EST LA GARDE QUI COMPTE LE PLUS DE TOUTE CETTE SECTION. Un code de bon
  // est un instrument au porteur : le rendre à l'acheteur d'un cadeau, c'est
  // mettre l'argent du destinataire sur un écran qu'il n'a pas encore reçu.
  const offert = confirmationDepuisBon({
    ...BASE, destinataire_mode: 'offrir', beneficiaire_prenom: 'Marie',
  })
  verifie('cadeau : la confirmation est rendue', offert.ok === true)
  verifie('🔴 cadeau : le CODE NE SORT PAS du serveur', offert.bon?.code === null)
  verifie('🔴 cadeau : le JETON NE SORT PAS non plus', offert.bon?.token === null)
  verifie('cadeau : le prénom du bénéficiaire est rendu, lui',
    offert.bon?.beneficiaire_prenom === 'Marie')
  verifie('cadeau : le montant reste rendu', offert.bon?.montant === 50)

  // ⚠️ ET LE REPLI EST « JE SUIS LE PORTEUR ». Un mode absent ou inconnu est un
  // achat pour soi, cas majoritaire. Seul un 'offrir' EXPLICITE retient le
  // code, comme seul un 'alimentaire' explicite dit « gourmand ».
  for (const mode of [undefined, null, '', 'MOI', 'inconnu']) {
    const r = confirmationDepuisBon({ ...BASE, destinataire_mode: mode })
    verifie(`repli porteur : mode ${JSON.stringify(mode)} rend le code`,
      r.ok === true && r.bon?.code === 'BC-7K2M-9XQ4')
  }
  // ⚠️ ET LE 'offrir' EXPLICITE, LUI, RETIENT TOUJOURS.
  verifie('repli porteur : seul « offrir » retient le code',
    confirmationDepuisBon({ ...BASE, destinataire_mode: 'offrir' }).bon?.code === null)

  // ─── LE WEBHOOK N'EST PAS ENCORE PASSÉ ────────────────────────────────────
  //
  // 🔴 LE PIÈGE QUE J'AI FAILLI POSER. La page `/cadeau/<token>` refuse tout bon
  // dont le statut n'est pas `actif`. Y rediriger l'acheteur afficherait « Bon
  // introuvable » à quelqu'un qui vient de payer, parce que le webhook met
  // quelques secondes. La confirmation, elle, doit accepter cet état ET le dire.
  const enAttente = confirmationDepuisBon({ ...BASE, statut: 'paiement_en_attente', destinataire_mode: 'moi' })
  verifie('webhook en retard : la confirmation est quand même rendue', enAttente.ok === true)
  verifie('webhook en retard : `actif` vaut faux, l\'écran dira l\'attente',
    enAttente.bon?.actif === false)
  verifie('bon actif : `actif` vaut vrai', moi.bon?.actif === true)

  // ─── CE QUI N'A PAS LE DROIT DE S'ANNONCER COMME UN ACHAT RÉUSSI ──────────
  for (const statut of ['annule', 'utilise', 'expire', 'rembourse', '']) {
    const r = confirmationDepuisBon({ ...BASE, statut, destinataire_mode: 'moi' })
    verifie(`statut « ${statut || '(vide)'} » : refusé, pas de confirmation tiède`,
      r.ok === false && r.raison === 'etat')
  }
  verifie('bon introuvable : refusé', confirmationDepuisBon(null).ok === false)
  verifie('deux états seulement mènent à une confirmation',
    ETATS_CONFIRMATION.length === 2
    && ETATS_CONFIRMATION.includes('actif')
    && ETATS_CONFIRMATION.includes('paiement_en_attente'))

  // ─── LE CÂBLAGE, AUX DEUX BOUTS DU FIL ────────────────────────────────────
  //
  // ⚠️ LE FIL SE TIENT AUX DEUX BOUTS. La règle du 31/08 : une signature qui
  // reçoit sans appelant qui passe donne l'air câblé sans l'être.
  const checkout = lireCode('app/api/bons-cadeaux/checkout/route.js')
  verifie('🔴 le retour de Stripe porte la session, sinon on ne sait RIEN',
    /success_url:[^\n]*session_id=\{CHECKOUT_SESSION_ID\}/.test(checkout))

  const routeConf = lireCode('app/api/bons-cadeaux/confirmation/route.js')
  verifie('la route délègue la décision au module pur',
    /confirmationDepuisBon\(/.test(routeConf))
  // ⚠️ AUCUNE ADRESSE EMAIL NE DOIT SORTIR DE CETTE ROUTE : le `select` ne les
  // demande même pas, et c'est ce qui rend la fuite impossible par distraction.
  verifie('🔴 la route ne lit AUCUNE adresse email',
    !/acheteur_email|beneficiaire_email/.test(routeConf))
  verifie('la route refuse ce qui ne ressemble pas à une session Stripe',
    /\^cs_/.test(routeConf))

  for (const tunnel of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    const src = lireCode(tunnel)
    verifie(`${tunnel} : la confirmation est montée`, /<BonConfirmation\b/.test(src))
    verifie(`${tunnel} : la session est LUE avant que l'URL soit nettoyée`,
      src.indexOf("params.get('session_id')") > 0
      && src.indexOf("params.get('session_id')") < src.indexOf("searchParams.delete('session_id')"))
    verifie(`${tunnel} : la session part bien à la route de confirmation`,
      /\/api\/bons-cadeaux\/confirmation/.test(src))
  }

  // ⚠️ ET LE COMPOSANT NE DEVINE PAS LA CATÉGORIE : sans elle il dirait « bon
  // cadeau » chez un boulanger, par le jeu du repli.
  const comp = lireCode('app/commander/BonConfirmation.js')
  verifie('le composant reçoit la catégorie, il ne la devine pas',
    /export default function BonConfirmation\(\{[^}]*categorie/.test(comp))
  verifie('le composant nomme le bon avec le module',
    /libelleBon\(categorie/.test(comp))
  // 🔴 UNE LECTURE RATÉE NE DOIT PAS EFFACER LA CONFIRMATION : le paiement a
  // réussi, Stripe ne renvoie ici que dans ce cas.
  verifie('sans détail, le composant confirme quand même le paiement',
    /if \(!bon\)/.test(comp))
  verifie('le lien vers la page du bon ne part que pour le porteur',
    /bon\.pour_moi && bon\.token/.test(comp))
}

console.log(`\n${ok} vérifications passées, ${echecs.length} en échec.`)
if (echecs.length) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log(`  ✕ ${e}`))
  process.exit(1)
}
