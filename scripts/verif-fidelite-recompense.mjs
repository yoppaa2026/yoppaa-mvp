// BANC : LA RÉCOMPENSE DE FIDÉLITÉ SE DÉPENSE EN LIGNE (bloc 2, 24/08).
//
// ⚠️ CE BANC RÉPOND À LA QUESTION D'ALEX : « j'ai rempli ma carte, maintenant
// je fais quoi avec ça ? ». Jusqu'ici la fidélité se GAGNAIT en ligne et ne se
// DÉPENSAIT qu'au comptoir. Pour un snack en Click and Collect, c'est-à-dire
// le cas d'usage principal, c'était incompréhensible.
//
// ⚠️ CINQ DÉFAUTS TROUVÉS EN ÉCRIVANT LE BRANCHEMENT, tous silencieux :
//   • Stripe ne basculait en « montant restant dû » que s'il y avait un BON
//     CADEAU : une récompense seule laissait facturer le PRIX PLEIN ;
//   • le mouvement de consommation portait `commande_id`, ce qui occupait
//     l'index unique et faisait sauter le crédit du passage au retrait ;
//   • `type: 'recompense_rendue'` viole la contrainte CHECK de la table ;
//   • `montantFidelisable` ne retirait pas la remise : dépenser sa récompense
//     remplissait la carte suivante, le programme s'auto-alimentait ;
//   • le bon cadeau était débité AVANT la récompense, donc brûlé sur une
//     commande annulée si la récompense venait à manquer.
//
//   npm run verif:recompense

import { readFileSync } from 'node:fs'
import {
  calculerRemiseRecompense,
  appliquerRecompenseAvantBon,
  recompenseUtilisable,
  libelleRemiseRecompense,
} from '../lib/fidelite-recompense.js'
import { calculerRemiseBon } from '../lib/bons-cadeaux.js'
import { montantFidelisable } from '../lib/fidelite.js'
import { construireLignes } from '../lib/export-comptable.js'
import { resteAEncaisser, caDesRdvs, etatPaiementRdv } from '../lib/rdv-paiement.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Le code SANS sa prose. Huit fois depuis le 19/08, une garde a été verte
// grâce au commentaire qui EXPLIQUE la règle au lieu du code qui l'applique.
const lireCode = (chemin) => lire(chemin)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

const lireSql = (chemin) => lire(chemin).replace(/^\s*--.*$/gm, ' ')

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

const MONTANT = { type: 'remise_montant', valeur: 5 }
const POURCENT = { type: 'remise_pct', valeur: 20 }

// ═══ 1) LA REMISE, EXÉCUTÉE ═══════════════════════════════════════════════
{
  egal('5 € sur 20 € retire 5 €', calculerRemiseRecompense(MONTANT, 20), 5)
  egal('20 % sur 20 € retire 4 €', calculerRemiseRecompense(POURCENT, 20), 4)

  // ⚠️ PLAFONNÉE AU TOTAL : une récompense de 5 € sur un panier à 4 € ne crée
  // pas un avoir de 1 €, elle solde la commande.
  egal('5 € sur 4 € ne retire que 4 €', calculerRemiseRecompense(MONTANT, 4), 4)

  // ⚠️ LE PLANCHER STRIPE, la même règle que le bon cadeau depuis le 31/07 :
  // un reste entre 0 et 0,50 € est INENCAISSABLE. On rabote la remise.
  egal('sur 5,30 €, on laisse exactement 0,50 € à payer',
    calculerRemiseRecompense(MONTANT, 5.30), 4.80)
  egal('et le reste vaut bien 0,50 €',
    Math.round((5.30 - calculerRemiseRecompense(MONTANT, 5.30)) * 100) / 100, 0.50)

  // ⚠️ UN POURCENTAGE ABERRANT NE VIDE PAS LA CAISSE.
  //
  // ⚠️ ET CETTE GARDE EST MUETTE À LA MUTATION, JE LE DIS PLUTÔT QUE DE LA
  // LAISSER CROIRE : retirer le `Math.min(100, valeur)` ne change RIEN, parce
  // que le plafonnement au total juste en dessous rattrape déjà tout. Les deux
  // protections se recouvrent. Je garde le bornage comme seconde barrière au
  // cas où l'ordre des opérations changerait un jour, mais ce qui est
  // réellement mesuré ici, c'est le plafond au total.
  egal('150 % ne peut pas dépasser le total',
    calculerRemiseRecompense({ type: 'remise_pct', valeur: 150 }, 30), 30)

  egal('une valeur négative ne retire rien',
    calculerRemiseRecompense({ type: 'remise_montant', valeur: -5 }, 20), 0)
  egal('pas de récompense, pas de remise', calculerRemiseRecompense(null, 20), 0)
  egal('un total nul ne produit rien', calculerRemiseRecompense(MONTANT, 0), 0)
}

// ═══ 2) L'ORDRE : RÉCOMPENSE PUIS BON CADEAU ══════════════════════════════
//
// ⚠️ C'EST LA RÈGLE QUI PROTÈGE LE PORTEUR DU BON. La récompense abaisse le
// prix, le bon paie ce qui reste. Dans l'autre sens, le bon serait consommé
// sur une part que le commerçant offrait de toute façon.
{
  const { remiseRecompense, base } = appliquerRecompenseAvantBon(MONTANT, 30)
  egal('la récompense retire 5 € de 30 €', remiseRecompense, 5)
  egal('il reste 25 € à couvrir', base, 25)

  // ⚠️ LE CONTRE-EXEMPLE NE VAUT QUE SI LE SOLDE DÉPASSE LA BASE. Avec un bon
  // de 20 € sur 30 €, les deux ordres dépensent 20 € et la garde serait verte
  // sans rien prouver. Il faut un bon LARGE (40 €) pour que l'ordre se voie.
  const SOLDE = 40
  const remiseBon = calculerRemiseBon(SOLDE, base)
  egal('un bon large ne couvre que les 25 € restants', remiseBon, 25)
  egal('le Yopper n\'a plus rien à payer', Math.round((base - remiseBon) * 100) / 100, 0)
  egal('et il lui reste 15 € sur son bon',
    Math.round((SOLDE - remiseBon) * 100) / 100, 15)

  const bonDabord = calculerRemiseBon(SOLDE, 30)
  egal('dans le MAUVAIS ordre, le bon dépenserait 30 €', bonDabord, 30)
  egal('🔴 son porteur perdrait 5 € de solde pour une part déjà offerte',
    Math.round((bonDabord - remiseBon) * 100) / 100, 5)

  // ⚠️ LA RÉCOMPENSE PEUT SOLDER SEULE : le tunnel doit alors confirmer sans
  // Stripe. Sans ce cas, on envoie le Yopper payer 0 €, ce que Stripe refuse.
  const seule = appliquerRecompenseAvantBon(MONTANT, 4)
  egal('5 € sur 4 € ne laisse rien à payer', seule.base, 0)
}

// ═══ 3) CE QUI EST UTILISABLE ═════════════════════════════════════════════
{
  const COM = 'com-1'
  verifie('une récompense neuve de ce commerçant est utilisable',
    recompenseUtilisable({ commercant_id: COM, utilisee_at: null }, COM).ok)
  egal('déjà utilisée : refus nommé',
    recompenseUtilisable({ commercant_id: COM, utilisee_at: '2026-08-24' }, COM).raison,
    'deja_utilisee')
  egal('autre commerçant : refus nommé',
    recompenseUtilisable({ commercant_id: 'autre', utilisee_at: null }, COM).raison,
    'autre_commercant')
  egal('absente : refus nommé', recompenseUtilisable(null, COM).raison, 'introuvable')
}

// ═══ 4) CE QU'ON ANNONCE AU YOPPER ════════════════════════════════════════
//
// ⚠️ ON ANNONCE CE QUI SERA DÉDUIT, pas la valeur nominale : une récompense de
// 5 € sur un panier à 4 € ne retire pas 5 €, et le dire ferait croire à un
// avoir de 1 € qui n'existe pas.
{
  verifie('sur un gros panier, on annonce 5,00 €',
    libelleRemiseRecompense(MONTANT, 20).includes('5,00 €'))
  verifie('sur un petit panier, on annonce 4,00 € et jamais 5,00 €',
    libelleRemiseRecompense(MONTANT, 4).includes('4,00 €')
    && !libelleRemiseRecompense(MONTANT, 4).includes('5,00 €'),
    libelleRemiseRecompense(MONTANT, 4))
  verifie('la virgule décimale est française',
    !libelleRemiseRecompense(MONTANT, 20).includes('5.00'))
  egal('rien à annoncer quand rien n\'est déduit',
    libelleRemiseRecompense(MONTANT, 0), null)
}

// ═══ 5) 🔴 LA BOUCLE QUI S'AUTO-ALIMENTE ══════════════════════════════════
//
// ⚠️ SI LA REMISE COMPTAIT DANS LA CAGNOTTE, dépenser sa récompense
// remplirait la carte suivante : à chaque tour le commerçant offrirait une
// part de plus sans qu'un euro entre en caisse.
{
  egal('une commande sans avantage fidélise son total',
    montantFidelisable({ total: 20 }), 20)
  egal('la part payée par un bon cadeau ne fidélise pas',
    montantFidelisable({ total: 20, bon_cadeau_montant: 8 }), 12)
  egal('🔴 la remise de fidélité NON PLUS',
    montantFidelisable({ total: 20, fidelite_remise: 5 }), 15)
  egal('les deux se cumulent',
    montantFidelisable({ total: 20, bon_cadeau_montant: 8, fidelite_remise: 5 }), 7)
  egal('et on ne descend jamais sous zéro',
    montantFidelisable({ total: 10, fidelite_remise: 10 }), 0)

  // ⚠️ ET LA COLONNE DOIT ÊTRE DANS LE SELECT, sinon elle vaut `undefined`,
  // donc zéro, et la garde ci-dessus reste verte pendant que la production
  // recompte tout. C'est LE défaut le plus fréquent du projet.
  const fs = lireCode('lib/fidelite-server.js')
  verifie('🔴 `fidelite_remise` est bien demandée à la base',
    /select\([^)]*fidelite_remise/.test(fs))
}

// ═══ 6) LA COMPTABILITÉ : LA REMISE BAISSE LE CA ══════════════════════════
//
// ⚠️ INVARIANT D'ALEX (23/08) : CA TTC = en ligne + comptoir + bon + reste.
// Une récompense n'est pas un règlement, personne ne l'a payée : c'est une
// vente moins chère. En la traitant comme un encaissement, la somme des
// colonnes serait inférieure au CA sans que rien ne l'explique.
{
  const commande = {
    id: 'c1', numero_commande: 4, numero_prefixe: 'CC', numero_semaine: 34,
    statut: 'recuperee', total: 20, frais_livraison: 0, mode_retrait: 'retrait',
    regime_tva: 'emporter', paye_en_ligne: true, bon_cadeau_montant: 0,
    fidelite_remise: 5, stripe_frais: null, stripe_net: null,
    date_commande: '2026-08-24', created_at: '2026-08-24T10:00:00Z',
    encaisse_mode: null, encaisse_montant: null, encaisse_le: null,
    client_nom: 'Alex V', commande_articles: [
      { article_id: 'a1', quantite: 1, prix_unitaire: 20, tva_taux: 6 },
    ],
  }
  const lignes = construireLignes({ commandes: [commande], rdvs: [], tauxDefaut: 21 })
  const l = lignes[0]
  egal('le CA est net de la remise', l.total, 15)
  egal('et l\'encaissement en ligne vaut ce CA', l.enLigne, 15)
  egal('l\'invariant tient',
    Math.round((l.enLigne + l.comptoir + l.bonCadeau + l.resteAEncaisser) * 100) / 100,
    l.total)

  // Le même, sans récompense : rien n'a bougé pour l'existant.
  const sansRec = construireLignes({
    commandes: [{ ...commande, fidelite_remise: 0 }], rdvs: [], tauxDefaut: 21,
  })[0]
  egal('sans récompense, le CA reste le total', sansRec.total, 20)

  // ⚠️ ET LA VENTILATION TVA SUIT : elle doit se totaliser au CA net, sinon la
  // déclaration porterait sur une base jamais encaissée.
  const sommeTaux = Object.values(l.parTaux).reduce((s, v) => s + v, 0)
  egal('la ventilation TVA se totalise au CA net',
    Math.round(sommeTaux * 100) / 100, 15)
}

// ═══ 7) LA SÉCURITÉ DU CHEMIN EN LIGNE ════════════════════════════════════
{
  const cc = lireCode('app/api/stripe/checkout/create-commande/route.js')

  // ⚠️ L'IDENTITÉ VIENT DU JETON, JAMAIS DU CORPS. `client_email` est envoyé
  // par le client : il ne prouve rien. Sans cette règle, on rendait n'importe
  // quel numéro de GSM interrogeable.
  verifie('🔴 la récompense exige une identité PROUVÉE',
    /identiteProuvee\(request\)/.test(cc))
  verifie('et elle ne se fie PAS à client_email pour la charger',
    /chargerRecompensePourYopper\(\s*supabase\s*,\s*\{[^}]*email:\s*identite\.email/.test(cc),
    'chargerRecompensePourYopper ne part pas de identite.email')

  // ⚠️ 🔴 LA LIGNE STRIPE. Tant que la condition ne regardait que le bon
  // cadeau, une récompense seule laissait facturer le PRIX PLEIN.
  verifie('🔴 Stripe facture le restant dû dès qu\'il y a UNE remise',
    /remiseBonEUR > 0 \|\| remiseRecompenseEUR > 0/.test(cc))

  // ⚠️ LE DÉBIT N'A LIEU QU'À LA CONFIRMATION : un panier abandonné ne brûle
  // rien. Sur le chemin en ligne, c'est le webhook qui consomme.
  verifie('la commande fige la remise et la récompense',
    /fidelite_recompense_id: recompense\?\.id \|\| null/.test(cc)
    && /fidelite_remise: remiseRecompenseEUR/.test(cc))
  verifie('rien n\'est consommé sans confirmation',
    /if \(recompense && confirmeSansStripe\)/.test(cc))

  // ⚠️ L'ORDRE DES DEUX PRISES : la récompense d'abord, parce qu'elle se rend
  // et que le bon cadeau, lui, ne se rend pas d'un revers de main.
  const posRec = cc.indexOf('consommerRecompense(supabase')
  const posBon = cc.indexOf('debiterBon(supabase')
  verifie('🔴 la récompense est prise AVANT le bon cadeau',
    posRec > 0 && posBon > 0 && posRec < posBon,
    `récompense ${posRec}, bon ${posBon}`)
  // ⚠️ ON EXIGE LA CONDITION AVEC L'APPEL, pas l'appel seul : `if (false)
  // await rendreRecompense(...)` laisse le motif intact et la garde verte.
  // Mesuré : sans la condition réelle, le banc rougit.
  verifie('et un bon refusé rend la récompense',
    /if \(recompense\) await rendreRecompense\(supabase, recompense\)/.test(cc))

  // ⚠️ LE DÛ ZÉRO SANS BON : la récompense seule doit ouvrir le chemin sans
  // Stripe, sinon on demande un paiement de 0 €.
  verifie('un dû nul par la seule récompense se confirme sans Stripe',
    /duCents === 0 && \(!!bonCadeau \|\| !!recompense\)/.test(cc))
}

// ═══ 8) LE WEBHOOK ET LES RETOURS EN ARRIÈRE ══════════════════════════════
{
  const wh = lireCode('app/api/stripe/webhook/route.js')
  verifie('le paiement en ligne confirmé consomme la récompense',
    /consommerRecompense\(supabase, \{[\s\S]{0,120}source: 'commande'/.test(wh))
  verifie('la colonne est demandée par le webhook',
    /select\('id, statut, paye_en_ligne[^']*fidelite_recompense_id/.test(wh))
  verifie('un remboursement TOTAL rend la récompense',
    /isRefundTotal && cmd\.fidelite_recompense_id/.test(wh))

  const cancel = lireCode('app/api/commande/cancel/route.js')
  // Même précaution : la condition fait partie de la garde.
  verifie('une annulation rend la récompense',
    /if \(recFid\?\.utilisee_at\) await rendreRecompense\(supabase, recFid\)/.test(cancel))
  verifie('et la colonne est dans le select de l\'annulation',
    /fidelite_recompense_id/.test(cancel.split('const query =')[0]))

  // ⚠️ LES MOTS DU JOURNAL SONT CONTRAINTS EN BASE. `recompense_rendue`
  // n'existe pas dans le CHECK : l'insertion serait rejetée sans bruit.
  const srv = lireCode('lib/fidelite-recompense-server.js')
  const sql = lireSql('migrations/MIGRATION_FIDELITE.sql')
  const typesAutorises = (sql.match(/type\s+text NOT NULL CHECK \(type IN \(([^)]*)\)/) || [])[1] || ''
  verifie('la contrainte des types est bien lue depuis la migration',
    typesAutorises.includes('ajustement'), typesAutorises)
  for (const t of (srv.match(/type: '([a-z_]+)'/g) || [])) {
    const valeur = t.match(/'([a-z_]+)'/)[1]
    verifie(`le type « ${valeur} » existe dans la contrainte`,
      typesAutorises.includes(`'${valeur}'`), typesAutorises)
  }
  for (const s of (srv.match(/source: '([a-z_]+)'/g) || [])) {
    const valeur = s.match(/'([a-z_]+)'/)[1]
    verifie(`la source « ${valeur} » existe dans la contrainte`,
      /source\s+text NOT NULL CHECK \(source IN \(([^)]*)\)/.test(sql)
      && sql.match(/source\s+text NOT NULL CHECK \(source IN \(([^)]*)\)/)[1].includes(`'${valeur}'`))
  }

  // ⚠️ 🔴 L'INDEX UNIQUE (carte_id, commande_id) NE TOLÈRE QU'UN MOUVEMENT PAR
  // COMMANDE. Si la consommation y inscrivait la commande, le crédit du
  // passage au retrait tomberait en doublon et serait pris pour un rejeu :
  // utiliser sa récompense coûterait le passage de cette commande.
  const bloc = srv.split('export async function consommerRecompense')[1] || ''
  const insert = bloc.split('fidelite_mouvements')[1] || ''
  verifie('🔴 le mouvement de consommation ne porte PAS commande_id',
    !/commande_id: commandeId/.test(insert.split('})')[0]),
    (insert.split('})')[0].match(/.*commande_id.*/) || [])[0])
  verifie('mais la récompense, elle, garde le lien vers la commande',
    /commande_id: commandeId/.test(bloc.split('fidelite_mouvements')[0]))
}

// ═══ 9) L'ÉCRAN : LA ROUTE EXISTE ET LE TUNNEL L'APPELLE ══════════════════
//
// ⚠️ LE PIÈGE DU 23/08 : une garde qui vérifie que la ROUTE existe ne prouve
// pas que l'ÉCRAN l'appelle. Les deux côtés, à chaque fois.
{
  const route = lireCode('app/api/fidelite/ma-recompense/route.js')
  verifie('la route exige une identité prouvée', /identiteProuvee\(request\)/.test(route))
  verifie('un invité reçoit un « rien à proposer », pas une erreur',
    /connecte: false, recompense: null/.test(route))
  verifie('elle ne rend NI téléphone NI jeton de carte',
    !/telephone/.test(route) && !/token/.test(route))

  const page = lireCode('app/commander/[slug]/page.js')
  verifie('le tunnel appelle la route', /ma-recompense\?commercant_id=/.test(page))
  verifie('🔴 et il envoie la commande AVEC la preuve d\'identité',
    /fetchAvecPreuveSiConnecte\('\/api\/stripe\/checkout\/create-commande'/.test(page),
    'sans le jeton, le serveur ne voit qu\'un invité et refuse la récompense')
  verifie('l\'identifiant de récompense part dans le corps',
    /fidelite_recompense_id: recompenseFid\.id/.test(page))

  // ⚠️ ELLE N'EST PAS COCHÉE D'AVANCE : 5 € sur un panier à 4 € en brûlerait 1.
  //
  // ⚠️ MA PREMIÈRE ÉCRITURE ÉTAIT VERTE POUR RIEN : elle cherchait
  // `useState(false)` n'importe où dans un fichier qui en contient des
  // dizaines. Une garde doit nommer SA variable.
  verifie('la récompense n\'est pas appliquée d\'office',
    /const \[recompenseActive, setRecompenseActive\] = useState\(false\)/.test(page))

  // ⚠️ LE CALCUL DE L'ÉCRAN SUIT LE MÊME ORDRE QUE LE SERVEUR, sinon le prix
  // affiché et le prix facturé divergent.
  verifie('l\'écran calcule le bon cadeau SUR la base d\'après récompense',
    /calculerRemiseBon\(bonApplique\.solde, baseApresRecompense\(\)\)/.test(page))
  verifie('et le dû couvert tient compte de la récompense',
    /totalDuApresBon\(\) === 0 && \(!!bonApplique \|\| remiseRecompenseEffective\(\) > 0\)/.test(page))
}

// ═══ 10) LE RENDEZ-VOUS ═══════════════════════════════════════════════════
//
// ⚠️ ARBITRAGE D'ALEX : LA RÉCOMPENSE BAISSE LE TOTAL, ET L'ACOMPTE SE CALCULE
// SUR CE TOTAL RÉDUIT. Le rendez-vous ne prend qu'un acompte en ligne, le
// solde se règle au comptoir : si la remise ne portait que sur le solde, le
// Yopper avancerait un acompte calculé sur un prix qu'il ne paie pas.
{
  const acompte = lireCode('app/api/stripe/checkout/create-rdv-acompte/route.js')
  verifie('le RDV exige une identité PROUVÉE', /identiteProuvee\(request\)/.test(acompte))
  verifie('🔴 l\'acompte se calcule sur le prix NET',
    /const acompteMontant = Math\.round\(prixNet \* acomptePct\) \/ 100/.test(acompte))
  verifie('le tarif de la prestation reste le BRUT dans les métadonnées',
    /prix_estime: String\(prixBase\)/.test(acompte))
  verifie('la remise et la récompense voyagent dans les métadonnées',
    /fidelite_recompense_id: String\(recompense\.id\)/.test(acompte)
    && /fidelite_remise: String\(remiseRecompenseEUR\)/.test(acompte))
  // ⚠️ 20 % d'un solde de 2 € valent 0,40 €, sous le minimum Stripe. On le DIT,
  // avec le geste à faire, plutôt que de laisser Stripe refuser sèchement.
  verifie('un acompte devenu trop faible est expliqué',
    /acompte_trop_faible/.test(acompte))
  // ⚠️ RIEN N'EST CONSOMMÉ ICI : le paiement n'est pas encore acquis.
  verifie('la récompense n\'est PAS consommée à la création',
    !/consommerRecompense/.test(acompte))

  const wh = lireCode('app/api/stripe/webhook/route.js')
  verifie('le RDV créé porte la récompense et sa remise',
    /fidelite_recompense_id: meta\.fidelite_recompense_id \|\| null/.test(wh)
    && /fidelite_remise: Number\(meta\.fidelite_remise\) \|\| 0/.test(wh))
  verifie('et elle est consommée avec la source « rdv »',
    /source: 'rdv'/.test(wh))
  // ⚠️ APRÈS L'INSERT, jamais avant : une insertion qui échoue est rejouée par
  // Stripe, et consommer d'abord brûlerait la récompense d'un RDV inexistant.
  const posInsert = wh.indexOf("from('rdv_reservations').insert(payload)")
  const posConso = wh.indexOf("source: 'rdv'")
  verifie('🔴 la consommation vient APRÈS la création du rendez-vous',
    posInsert > 0 && posConso > posInsert, `insert ${posInsert}, conso ${posConso}`)

  const annul = lireCode('app/api/rdv/cancel/route.js')
  verifie('un rendez-vous annulé rend la récompense',
    /if \(recFid\?\.utilisee_at\) await rendreRecompense\(supabase, recFid\)/.test(annul))
  verifie('et la colonne est bien demandée',
    /fidelite_recompense_id/.test(annul.split('const query =')[0]))

  // ⚠️ 🔴 LA LIMITE ASSUMÉE : le RDV SANS acompte est inséré depuis le
  // NAVIGATEUR. Y brancher la récompense laisserait le client écrire lui-même
  // le montant de sa remise, c'est-à-dire le défaut corrigé le 24/08 sur la
  // carte de fidélité. Le bloc n'est donc proposé que si un acompte en ligne
  // est demandé. Cette garde EXISTE pour empêcher qu'on lève la condition sans
  // avoir d'abord écrit la route serveur.
  const pageRdv = lireCode('app/commander/rdv/[slug]/page.js')
  verifie('🔴 la récompense n\'est proposée QUE si un acompte en ligne est pris',
    /recompenseFid && !seanceSurAbo && prixBase != null && acompteEnLigne &&/.test(pageRdv),
    'sans acompte, le RDV s\'insère depuis le navigateur : la remise serait écrite par le client')
  verifie('l\'écran du RDV envoie la réservation avec la preuve d\'identité',
    /fetchAvecPreuveSiConnecte\('\/api\/stripe\/checkout\/create-rdv-acompte'/.test(pageRdv))
  verifie('et l\'identifiant part dans le corps',
    /fidelite_recompense_id: recompenseFid\.id/.test(pageRdv))
  verifie('la récompense du RDV n\'est pas active d\'office',
    /const \[recompenseActive, setRecompenseActive\] = useState\(false\)/.test(pageRdv))
}

// ═══ 11) CE QUE LE COMMERÇANT RÉCLAME AU COMPTOIR ═════════════════════════
{
  verifie('le solde d\'un RDV retire la récompense',
    resteAEncaisser({ prix_estime: 30, fidelite_remise: 5 }) === 25,
    String(resteAEncaisser({ prix_estime: 30, fidelite_remise: 5 })))
  verifie('acompte payé compris',
    resteAEncaisser({ prix_estime: 30, fidelite_remise: 5, acompte_montant: 6.25, acompte_paye: true }) === 18.75,
    String(resteAEncaisser({ prix_estime: 30, fidelite_remise: 5, acompte_montant: 6.25, acompte_paye: true })))
  verifie('sans récompense, rien ne change',
    resteAEncaisser({ prix_estime: 30 }) === 30)
  // ⚠️ LE NULL RESTE UN NULL. `Number(null)` vaut 0 : une prestation sur devis
  // annoncerait « 0,00 € à encaisser ». Piège rencontré trois fois sur ce
  // projet, et signalé dans le fichier lui-même.
  verifie('une prestation sur devis reste « on ne sait pas »',
    resteAEncaisser({ prix_estime: null, fidelite_remise: 5 }) === null)
  verifie('une séance d\'abonnement ne doit toujours rien',
    resteAEncaisser({ abonnement_id: 'a1', prix_estime: 30 }) === 0)

  // ⚠️ ET LA PHRASE MONTRÉE AU COMMERÇANT, pas seulement le nombre. C'est elle
  // qu'il lit avant de réclamer l'argent : si elle annonce le tarif plein, il
  // demandera 30 € à quelqu'un qui a vu 25 € au moment de réserver, et c'est
  // le client qui aura raison. Garde ajoutée après une mutation MUETTE.
  const etat = etatPaiementRdv({
    prix_estime: 30, fidelite_remise: 5, statut: 'confirme',
    date_rdv: '2030-01-01', heure_debut: '10:00', heure_fin: '11:00',
  })
  verifie('🔴 l\'écran du commerçant annonce le prix NET',
    etat.libelle.includes('25,00') && !etat.libelle.includes('30,00'),
    etat.libelle)

  const ca = caDesRdvs([{ prix_estime: 30, fidelite_remise: 5, statut: 'honore', date_rdv: '2020-01-01', heure_debut: '10:00' }])
  verifie('le CA des rendez-vous est net de récompense',
    ca.encaisse + ca.attendu === 25, `encaissé ${ca.encaisse}, attendu ${ca.attendu}`)
}

// ═══ RÉSULTAT ═════════════════════════════════════════════════════════════
if (echecs.length > 0) {
  console.log(`\n${ok} vérifications passées, ${echecs.length} en échec.\n`)
  console.log('ÉCHECS :')
  echecs.forEach(e => console.log(`  ✕ ${e}`))
  process.exit(1)
}
console.log(`\n${ok} vérifications passées, 0 en échec.`)
console.log('Récompense de fidélité verte.')
