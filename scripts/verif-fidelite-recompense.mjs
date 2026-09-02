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
  libelleOffreRecompense,
  libelleRecompenseUtilisee,
  libelleAutresRecompenses,
  libelleCarteRecompenses,
  perteRecompense,
  libellePerteRecompense,
} from '../lib/fidelite-recompense.js'
import { calculerRemiseBon } from '../lib/bons-cadeaux.js'
import { montantFidelisable } from '../lib/fidelite.js'
import { construireLignes } from '../lib/export-comptable.js'
import { resteAEncaisser, caDesRdvs, etatPaiementRdv, resteAEncaisserCommande, soldeRdv } from '../lib/rdv-paiement.js'
import { emailRdvConfirme, emailNouveauRdvCommercant } from '../lib/resend.js'
import { valeurCommande, valeurRdv, chiffreAffaires } from '../lib/statistiques.js'
import { modesPaiementOuverts, modePaiementEffectif } from '../lib/modes-paiement.js'
import { emailCommandeConfirmee, emailNouvelleCommandeCommercant } from '../lib/resend.js'
import { cleReprisePanier } from '../lib/retour-paiement.js'
import { sansProse } from './lire-code.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Le code SANS sa prose. Huit fois depuis le 19/08, une garde a été verte
// grâce au commentaire qui EXPLIQUE la règle au lieu du code qui l'applique.
// ⚠️ LE DÉPOUILLEUR EST PARTAGÉ (`scripts/lire-code.mjs`) : il vivait recopié
// dans huit bancs, et le défaut du 29/08 aurait dû être corrigé huit fois.
const lireCode = (chemin) => sansProse(lire(chemin))

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
  // ⚠️ CETTE GARDE CHERCHAIT `debiterBon(supabase`, AU SINGULIER. Le 01/09 le
  // débit est passé en boucle pour cumuler plusieurs bons sur une commande, la
  // fonction s'appelle `debiterBons`, et la garde a rougi alors que l'ORDRE
  // qu'elle défend n'avait pas changé d'une ligne. On vise le préfixe commun,
  // qui reste vrai que le débit soit unitaire ou groupé.
  const posRec = cc.indexOf('consommerRecompense(supabase')
  const posBon = cc.search(/debiterBons?\(supabase/)
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
  //
  // ⚠️ CES DEUX GARDES NOMMAIENT `bonApplique`, AU SINGULIER. Le 01/09 l'écran
  // accepte PLUSIEURS bons (`bonsAppliques`) et répartit avec `repartirBons` :
  // elles ont rougi alors que la règle qu'elles défendent — le bon se calcule
  // APRÈS la récompense, jamais avant — n'a pas bougé d'une ligne.
  //
  // 🔴 ET C'EST BIEN CETTE RÈGLE QUI COMPTE : dans l'autre ordre, le porteur du
  // bon perdrait du solde sur une part qui lui était offerte de toute façon.
  verifie('l\'écran répartit les bons SUR la base d\'après récompense',
    /repartirBons\(bonsAppliques, baseApresRecompense\(\)\)/.test(page))
  verifie('et le dû couvert tient compte de la récompense',
    /totalDuApresBon\(\) === 0 && \(bonsAppliques\.length > 0 \|\| remiseRecompenseEffective\(\) > 0\)/.test(page))
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
  // ⚠️ CETTE GARDE RECOPIAIT LA FORMULE, ET LA FORMULE A DÉMÉNAGÉ (29/08).
  // Elle vit maintenant dans `lib/tunnel-rdv-montants.js`, seul endroit du
  // projet où l'acompte se calcule, et `verif:tunnel-rdv` l'EXÉCUTE sur le cas
  // F22 (30 € à 25 % avec 5 € de récompense font 6,25 €). Ici on ne garde que
  // ce qui reste vrai à cet endroit : la route DÉLÈGUE, et ne refait pas le
  // calcul dans son coin sur le prix plein.
  verifie('🔴 l\'acompte vient du module unique, pas d\'une recopie',
    /ventilerTunnelRdv\(/.test(acompte))
  verifie('🔴 et il n\'est jamais calculé sur le prix plein',
    !/Math\.round\(prixBase \* acomptePct\)/.test(acompte))
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
  // ⚠️ LA CONSOMMATION A DÉMÉNAGÉ DANS LE MODULE LE 30/08, avec le débit du bon
  // cadeau : les deux gestes sont les mêmes pour les trois chemins qui créent un
  // rendez-vous, et les tenir en trois exemplaires garantissait qu'un jour l'un
  // des trois oublierait l'un des deux.
  const modRdv = lireCode('lib/rdv-creation-server.js')
  verifie('et elle est consommée avec la source « rdv »',
    /consommerRecompense\(db, \{ recompense: recFid, source: 'rdv', rdvId \}\)/.test(modRdv))
  // ⚠️ APRÈS L'INSERT, jamais avant : une insertion qui échoue est rejouée par
  // Stripe, et consommer d'abord brûlerait la récompense d'un RDV inexistant.
  // ⚠️ MESURÉ SUR LES TROIS APPELANTS, pas sur un seul : c'est l'ORDRE qui
  // protège, et il se perd appelant par appelant.
  for (const [nom, chemin, creation] of [
    ['le webhook Stripe', 'app/api/stripe/webhook/route.js', 'creerReservationRdv(supabase, {'],
    ['la réservation sans paiement', 'app/api/rdv/reserver/route.js', 'creerReservationRdv(db, {'],
  ]) {
    const src = lireCode(chemin)
    const posInsert = src.indexOf(creation)
    const posConso = src.indexOf('appliquerAvantagesRdv(')
    verifie(`🔴 ${nom} : la consommation vient APRÈS la création du rendez-vous`,
      posInsert > 0 && posConso > posInsert, `insert ${posInsert}, conso ${posConso}`)
  }
  // Le tunnel avec produits consomme lui-même, ses deux avantages se ventilant
  // sur deux cibles : même règle, même ordre.
  {
    const src = lireCode('app/api/stripe/checkout/create-rdv-commande/route.js')
    const posInsert = src.indexOf('creerReservationRdv(supabase, {')
    const posConso = src.indexOf("consommerRecompense(supabase, { recompense, source: 'rdv'")
    verifie('🔴 le tunnel avec produits consomme APRÈS la création aussi',
      posInsert > 0 && posConso > posInsert, `insert ${posInsert}, conso ${posConso}`)
  }

  // 🔴 ELLE ÉTAIT RENDUE, ET PERSONNE NE LE DISAIT (Alex, 30/08, sur son propre
  // parcours). Le montant du BON remontait jusqu'à l'écran et jusqu'à l'email ;
  // la récompense, elle, revenait en silence sur la carte de fidélité. Alex l'a
  // vu parce qu'il est allé vérifier. Un Yopper croit avoir perdu ses 10 €.
  //
  // ⚠️ LES DEUX ROUTES D'ANNULATION SONT DES FRÈRES, et le défaut vivait dans
  // les deux : `rendreAvantages` avait été recopiée telle quelle de l'une à
  // l'autre. On les mesure ensemble, sinon on en corrige une et pas l'autre.
  for (const [nom, chemin, client] of [
    ['l’annulation par le Yopper', 'app/api/rdv/cancel/route.js', 'supabase'],
    ['l’annulation par le commerçant', 'app/api/rdv/annuler-commercant/route.js', 'supabase'],
  ]) {
    const src = lireCode(chemin)
    // 🔴 ET LE 30/08 AU SOIR, LE MÊME DÉFAUT A RECOMMENCÉ, D'UN CRAN PLUS
    // SUBTIL : les deux routes rendaient la récompense, et n'en parlaient que
    // si c'était ELLES qui l'avaient rendue. Le webhook `charge.refunded` fait
    // les mêmes gestes en secours ; dès qu'il passait le premier, l'email se
    // taisait sur un retour bel et bien effectué. Alex l'a lu sur sa capture.
    //
    // ⚠️ CES DEUX GARDES CHERCHAIENT `await rendreRecompense(supabase, recFid)`
    // DANS LA ROUTE. C'est ce qui les a laissées vertes sur DEUX copies
    // divergentes du même geste, et c'est la copie qui a fabriqué le défaut.
    // Le geste vit maintenant dans `lib/rdv-annulation-server.js`, et le banc
    // du tunnel l'EXÉCUTE sur une base simulée : c'est là que le contenu se
    // mesure. Ici, on mesure ce que la route TRANSMET.
    verifie(`${nom} délègue le retour au module partagé`,
      new RegExp(`rendreAvantagesRdv\\(${client}, \\{`).test(src))
    verifie(`${nom} lui passe la récompense du rendez-vous`,
      /recompenseId: [^\n]*rdv\.fidelite_recompense_id/.test(src))
    verifie(`${nom} n’en garde aucune copie locale`,
      !/const rendreAvantages = async/.test(src))
    verifie(`${nom} remonte le montant à l’appelant`,
      /recompense_rendue/.test(src))
    // 🔴 LA COLONNE DU MONTANT DOIT ÊTRE DEMANDÉE. Absente du `select`, elle
    // vaut `undefined`, `Number(undefined || 0)` vaut 0, la ligne disparaît et
    // AUCUNE erreur ne se lève. C'est le défaut le plus fréquent du projet, et
    // je l'ai recréé dans la route commerçant en écrivant ce correctif.
    verifie(`${nom} demande la remise figée`,
      /fidelite_remise/.test(src.split('.eq(\'id\', rdv_id)')[0] || src))
  }
  const annul = lireCode('app/api/rdv/cancel/route.js')
  verifie('et la colonne de la récompense est bien demandée',
    /fidelite_recompense_id/.test(annul.split('const query =')[0]))
  // ⚠️ ET LE GABARIT D'EMAIL A SA LIGNE, sinon les deux routes calculent un
  // montant que personne n'affiche.
  const mail = lireCode('lib/resend.js')
  verifie('l’email d’annulation annonce la récompense rendue',
    /Ta récompense fidélité de <strong>\$\{euros\(surCarteFid\)\}<\/strong> retourne sur ta carte/.test(mail))
  // ⚠️ ET LE BLOC RESTE VERT quand seule la fidélité revient : sans ça, un
  // rendez-vous payé entièrement par la récompense passait en orange
  // « Remboursement à voir » alors que tout était déjà revenu.
  verifie('et le bloc reste vert quand seule la récompense revient',
    /const vert = refund_en_cours \|\| surBon > 0 \|\| surCarteFid > 0/.test(mail))

  // ⚠️ LA RAISON DE CETTE GARDE A CHANGÉ LE 30/08, ET IL FAUT LE DIRE.
  //
  // Elle existait parce que le rendez-vous SANS acompte s'insérait depuis le
  // NAVIGATEUR : y brancher la récompense aurait laissé le client écrire
  // lui-même le montant de sa remise. Ce n'est plus vrai, `/api/rdv/reserver`
  // crée tout côté serveur.
  //
  // ⚠️ ELLE RESTE, POUR UNE AUTRE RAISON, ET C'EST UNE DÉCISION D'ALEX : sans
  // paiement en ligne, on INFORME, on ne débite pas. Consommer une récompense
  // des semaines avant un rendez-vous qui ne fait sortir aucun argent, c'est la
  // brûler pour rien si la personne ne vient pas. La récompense reste utilisable
  // au comptoir, où le commerçant la voit sur la fiche.
  const pageRdv = lireCode('app/commander/rdv/[slug]/page.js')
  verifie('la récompense n\'est proposée QUE si un acompte en ligne est pris',
    /recompenseFid && !seanceSurAbo && prixBase != null && acompteEnLigne &&/.test(pageRdv),
    'sans paiement en ligne, on informe, on ne débite pas (décision Alex 30/08)')
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

// ═══ 12) LES ÉCRANS DU YOPPER (bloc 3) ════════════════════════════════════
{
  const token = lireCode('app/carte/[token]/page.js')
  // ⚠️ CE TEXTE MENTAIT ET A COÛTÉ SA QUESTION À ALEX. Le commerçant n'a
  // AUCUN moyen de se servir d'un écran montré : sa seule porte d'entrée au
  // comptoir est le NUMÉRO DE GSM.
  verifie('🔴 « montre cet écran » a disparu de la carte',
    !/[Mm]ontre cet écran/.test(token),
    (token.match(/.*[Mm]ontre cet écran.*/) || [])[0])
  verifie('et le geste réel est écrit : le numéro de GSM',
    /numéro de GSM/.test(token))
  verifie('avec le second chemin, en ligne',
    /au moment de payer/.test(token))

  const fiche = lireCode('app/commander/CarteFideliteFiche.js')
  // ⚠️ LA JAUGE CONTREDISAIT LA RÉCOMPENSE : « 2/11 » à côté de « débloquée ».
  // Les deux nombres sont justes, le cycle a simplement repris. On les sépare.
  // ⚠️ UN `||` ENTRE DEUX MOTIFS REND LA GARDE VERTE GRÂCE À L'AUTRE BRANCHE.
  // Mesuré : casser la phrase des PASSAGES laissait la garde verte parce que
  // celle de la CAGNOTTE existait encore. Les deux mécaniques doivent être
  // couvertes, donc les deux motifs sont exigés séparément.
  verifie('🔴 la nouvelle carte est nommée (passages)',
    /Ta nouvelle carte a déjà/.test(fiche))
  verifie('🔴 et la nouvelle cagnotte aussi',
    /Ta nouvelle cagnotte a déjà repris/.test(fiche))
  verifie('le geste est rappelé sur la fiche aussi',
    /donne ton numéro de GSM/i.test(fiche))
  verifie('et les cartes multiples sont NOMMÉES',
    /nbCartes > 1/.test(fiche))

  // ⚠️ UNE GARDE QUI VÉRIFIE LE COMPOSANT NE PROUVE PAS QUE L'ÉCRAN LE NOURRIT.
  // Piège du 23/08 : les deux côtés, à chaque fois.
  for (const p of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    const page = lireCode(p)
    verifie(`${p} passe le nombre de cartes`, /nbCartes=\{cartesCeCommerce\}/.test(page))
    verifie(`${p} le reçoit du serveur`, /setCartesCeCommerce\(j\.cartes_ce_commerce \|\| 0\)/.test(page))
  }

  // ⚠️ 🔴 LE `.limit(1)` SUR `updated_at` CACHAIT LA CARTE PLEINE. Un passage
  // crédité sur un second numéro faisait disparaître de l'écran la carte qui
  // portait la récompense : elle existait toujours, son porteur ne pouvait
  // plus la voir ni la dépenser.
  const mesCartes = lireCode('app/api/fidelite/mes-cartes/route.js')
  verifie('🔴 la carte qui a une récompense passe devant',
    /order\('recompenses_disponibles', \{ ascending: false \}\)/.test(mesCartes))
  verifie('et l\'ancien limit(1) a disparu',
    !/\.limit\(1\)/.test(mesCartes),
    (mesCartes.match(/.*\.limit\(1\).*/) || [])[0])
  verifie('le nombre de cartes du commerce est rendu',
    /cartes_ce_commerce: liste\.length/.test(mesCartes))
}

// ═══ RÉSULTAT ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════
// 13. Le retour de Stripe, et les deux phrases du tunnel (24/08, après tests)
// ═════════════════════════════════════════════════════════════════════════

{
  // ⚠️ EXÉCUTÉES, jamais cherchées au mot.
  const montant = { type: 'montant', valeur: 5 }
  const offre = libelleOffreRecompense(montant, 30)
  verifie('l\'offre annonce le montant qui revient au Yopper', offre?.includes('5,00 €'))
  verifie('l\'offre lui parle de ce qui l\'attend', /qui t’attend/.test(offre || ''))
  // ⚠️ L'accord suit le montant : une faute sur l'écran qui parle d'argent
  // coûte plus en crédibilité qu'elle ne coûte de temps à écrire.
  verifie('l\'offre accorde au pluriel au-dessus de 1 €', /t’attendent/.test(offre || ''))
  verifie('l\'offre accorde au singulier à 1 €',
    /t’attend\b/.test(libelleOffreRecompense({ type: 'montant', valeur: 1 }, 30) || ''))

  // ⚠️ ON ANNONCE CE QUI SERA RÉELLEMENT DÉDUIT : 10 € sur un panier à 6 €
  // ne retire pas 10 €, et le dire ferait croire à un avoir qui n'existe pas.
  verifie('l\'offre plafonne au panier', libelleOffreRecompense({ type: 'montant', valeur: 10 }, 6)?.includes('6,00 €'))
  verifie('l\'offre se tait quand il n\'y a rien à déduire',
    libelleOffreRecompense({ type: 'montant', valeur: 5 }, 0) === null)

  const utilisee = libelleRecompenseUtilisee(montant, 30)
  verifie('la confirmation félicite au lieu d\'accuser réception', /^Bravo/.test(utilisee || ''))
  verifie('la confirmation redit le montant déduit', utilisee?.includes('-5,00 €'))

  // Les deux tunnels lisent ces phrases, ils ne les recopient pas.
  for (const f of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    const src = lireCode(f)
    verifie(`${f} appelle l'offre`, /libelleOffreRecompense\(/.test(src))
    verifie(`${f} appelle la confirmation`, /libelleRecompenseUtilisee\(/.test(src))
    verifie(`${f} n'écrit plus l'ancienne phrase sans envie`, !/récompense fidélité t’attend/.test(src))
  }

  // 🔴 LE BOUTON QUI RESTAIT SUR « REDIRECTION… » AU RETOUR DE STRIPE.
  // Sept écrans redirigent vers Stripe, aucun ne s'en protégeait : le
  // navigateur restaure la page depuis son cache, state React compris.
  const hook = lireCode('lib/retour-paiement.js')
  verifie('le remède écoute pageshow', /addEventListener\('pageshow'/.test(hook))
  // ⚠️ PAS `visibilitychange` : il se déclenche au changement d'onglet et
  // effacerait l'état « en cours » pendant qu'une requête est en vol.
  verifie('le remède n\'écoute pas visibilitychange', !/visibilitychange/.test(hook))
  // ⚠️ Et il ne teste pas `persisted` : plusieurs navigateurs restaurent une
  // page sans poser ce drapeau.
  verifie('le remède ne se fie pas au drapeau persisted', !/\.persisted/.test(hook))

  // ⚠️ GARDES MESURÉES MUETTES : chercher `useResetAuRetourDePaiement(` dans
  // ConfigDashboard restait vert quand on retirait l'un des DEUX appels, les
  // packs SMS et la boutique, parce que l'autre portait le même mot. Une garde
  // qui cherche un appel verdit sur n'importe lequel de ses homonymes : on
  // nomme donc le SETTER de chaque écran, il est unique.
  const ECRANS_QUI_PAIENT = [
    ['app/commander/[slug]/page.js', 'setLoadingCommande'],
    ['app/commander/rdv/[slug]/page.js', 'setSubmitting'],
    ['app/commander/BonCadeauModal.js', 'setLoading'],
    ['app/dashboard/ConfigDashboard.js', 'setAchatSms'],
    ['app/dashboard/ConfigDashboard.js', 'setEnvoi'],
    ['app/dashboard/TabPaiements.js', 'setConnecting'],
  ]
  for (const [f, setter] of ECRANS_QUI_PAIENT) {
    verifie(`${f} remet ${setter} au repos au retour de Stripe`,
      new RegExp(`useResetAuRetourDePaiement\\(\\(\\) => ${setter}\\(false\\)\\)`).test(lireCode(f)))
  }
}


// ── 🔴 LA RÉCOMPENSE EXISTAIT À DEUX ENDROITS (25/08, test F16 d'Alex) ────
//
// Le COMPTEUR `fidelite_cartes.recompenses_disponibles` était alimenté par
// `appliquerCredit`, la fiche du commerce le lisait pour annoncer « ta
// récompense est débloquée », et le SMS partait. Mais la LIGNE
// `fidelite_recompenses`, seule chose que le tunnel de paiement interroge,
// n'était créée NULLE PART dans le code : les seules existantes venaient du
// rattrapage unique de la migration.
//
// Toute récompense débloquée depuis était donc ANNONCÉE au client et
// INTROUVABLE au paiement. Ce n'était pas un défaut du détail : le Click and
// Collect marchait seulement parce que ces cartes-là dataient d'avant.
{
  const rs = lireCode('lib/fidelite-recompense-server.js')
  verifie('une fonction crée les récompenses au déblocage',
    /export async function creerRecompensesDebloquees/.test(rs))
  verifie('et elle écrit bien dans la table des récompenses',
    /from\('fidelite_recompenses'\)\s*\.insert\(/.test(rs))
  // ⚠️ AUTANT DE LIGNES QUE DE RÉCOMPENSES : une cagnotte qui dépasse deux
  // fois le seuil d'un coup en débloque deux, et le compteur le sait.
  verifie('elle en crée autant que le compteur en annonce',
    /Array\.from\(\{ length: n \}/.test(rs))
  verifie('elle ne fait rien quand rien n\'est débloqué', /if \(n <= 0/.test(rs))
  // ⚠️ LA CONFIGURATION EST FIGÉE : le montant est celui du jour où le client
  // l'a gagnée. Un commerçant qui baisse sa récompense ne reprend pas ce qu'il
  // a déjà promis. Mêmes replis que la migration, pour que les lignes créées à
  // chaud soient indiscernables de celles du rattrapage.
  verifie('elle fige le type, la valeur et le libellé du commerçant',
    /fidelite_recompense_type/.test(rs) && /fidelite_recompense_valeur/.test(rs)
    && /fidelite_recompense_libelle/.test(rs))
  verifie('avec les mêmes replis que la migration',
    /'remise_montant'/.test(rs) && /\|\| 5\b/.test(rs) && /'Récompense fidélité'/.test(rs))

  // 🔴 LES DEUX CHEMINS DE CRÉDIT, pas un seul. Le chemin automatique (commande
  // récupérée, rendez-vous honoré) ET le comptoir avaient le même trou.
  const auto = lireCode('lib/fidelite-server.js')
  const comptoir = lireCode('app/api/fidelite/mouvement/route.js')
  verifie('le crédit automatique crée la récompense',
    /creerRecompensesDebloquees\(supabase, \{ carte, commercant, nombre: debloquees \}\)/.test(auto))
  verifie('le crédit au comptoir la crée aussi',
    /creerRecompensesDebloquees\(db, \{ carte: maj, commercant: com, nombre: debloquees \}\)/.test(comptoir))
  // ⚠️ Chacun sous SA garde `debloquees > 0` : créée sans déblocage, elle
  // offrirait une récompense que personne n'a gagnée.
  verifie('le comptoir ne crée rien sans déblocage',
    /if \(debloquees > 0\) \{[\s\S]{0,400}creerRecompensesDebloquees/.test(comptoir))
  verifie('le chemin automatique non plus',
    /if \(debloquees > 0\) \{[\s\S]{0,600}creerRecompensesDebloquees/.test(auto))

  // ⚠️ LE SMS PART APRÈS, jamais avant : il annonce au client quelque chose
  // qui doit exister quand il clique sur le lien.
  //
  // ⚠️ GARDE MESURÉE MUETTE : comparer les positions de `creerRecompensesDebloquees`
  // et du SMS restait vrai même en inversant l'ordre, parce que `indexOf`
  // trouvait la LIGNE D'IMPORT, toujours en tête de fichier. Troisième fois
  // que ce motif exact passe. On compare les positions des APPELS, reconnus à
  // leur premier argument.
  for (const [nom, src, appel] of [
    ['le chemin automatique', auto, 'creerRecompensesDebloquees(supabase,'],
    ['le comptoir', comptoir, 'creerRecompensesDebloquees(db,'],
  ]) {
    const posCreation = src.indexOf(appel)
    const posSms = src.indexOf('smsRecompenseDebloquee(db,') >= 0
      ? src.indexOf('smsRecompenseDebloquee(db,')
      : src.indexOf('smsRecompenseDebloquee(supabase,')
    verifie(`${nom} crée la récompense AVANT d'envoyer le SMS`,
      posCreation >= 0 && posSms >= 0 && posCreation < posSms)
  }
}

// ── Le panier qui survit à une annulation Stripe (24/08, test F13) ────────
{
  // ⚠️ Une clé PAR COMMERCE, sinon le panier du boucher réapparaît chez le
  // coiffeur.
  verifie('la clé de reprise porte le slug du commerce',
    cleReprisePanier('boucher').includes('boucher'))
  verifie('deux commerces ne partagent pas la même clé',
    cleReprisePanier('a') !== cleReprisePanier('b'))

  const tun = lireCode('app/commander/[slug]/page.js')

  // ⚠️ `sessionStorage` et JAMAIS `localStorage` : le panier doit mourir avec
  // l'onglet, sinon il ressuscite des semaines plus tard avec des articles
  // supprimés et des prix périmés.
  verifie('le panier est mis de côté avant de partir chez Stripe',
    /sessionStorage\.setItem\(cleReprisePanier\(slug\)/.test(tun))
  verifie('il n\'est pas confié à localStorage',
    !/localStorage\.setItem\(cleReprisePanier/.test(tun))
  verifie('le panier est repris au retour annulé',
    /sessionStorage\.getItem\(cleReprisePanier\(slug\)/.test(tun))
  verifie('et effacé après reprise',
    /sessionStorage\.removeItem\(cleReprisePanier\(slug\)/.test(tun))
  // ⚠️ Effacé AUSSI au paiement réussi, sinon le Yopper verrait réapparaître
  // au prochain passage une commande qu'il a déjà payée.
  verifie('et effacé après un paiement abouti',
    (tun.match(/removeItem\(cleReprisePanier\(slug\)/g) || []).length >= 2)

  // ⚠️ La récompense repart avec le panier : sans elle, le Yopper qui revient
  // ne penserait pas à la recocher et paierait le prix plein.
  // ⚠️ TROISIÈME GARDE DU MÊME LOT À AVOIR ROUGI POUR LE MÊME MOTIF : elle
  // nommait `bonApplique`, au singulier. Ce qu'elle défend, c'est que la
  // récompense ET les bons partent ENSEMBLE dans le panier mis de côté avant
  // Stripe — sinon celui qui revient d'un paiement annulé les perd.
  verifie('la récompense fait partie de ce qu\'on met de côté',
    /recompenseActive,\s*\n\s*bonsAppliques/.test(tun))
  verifie('et elle se recoche toute seule au retour',
    /snap\?\.recompenseActive\) setRecompenseActive\(true\)/.test(tun))

  // ⚠️ La phrase ne promet un panier intact QUE s'il l'est vraiment : les deux
  // formulations doivent exister, sinon on ment dans un des deux cas.
  verifie('la phrase du retour dit la vérité sur le panier',
    /Ta commande est intacte/.test(tun) && /Tu peux refaire ta commande/.test(tun))

  // ⚠️ GARDE RETIRÉE, PAS MAQUILLÉE. J'avais écrit ici l'interdiction de la
  // phrase qui mentait (« panier hydraté depuis localStorage ») : elle
  // rougissait sur MON PROPRE commentaire, celui qui cite l'ancienne promesse
  // pour expliquer le défaut. Le piège du commentaire, dans l'autre sens.
  //
  // Et la garde était de toute façon mal posée : ce qu'il faut protéger n'est
  // pas l'absence d'une phrase, c'est la PRÉSENCE du mécanisme. Les quatre
  // vérifications au-dessus le font déjà, et elles, elles se mesurent.
}

// ═════════════════════════════════════════════════════════════════════════
// 15. 🔴 DEUX RÉCOMPENSES EN BASE, UNE SEULE À L'ÉCRAN (25/08, trouvé par Alex)
// ═════════════════════════════════════════════════════════════════════════
//
// Le compteur `recompenses_disponibles` est un NOMBRE, et TROIS écrans sur
// quatre le lisaient comme un BOOLÉEN : la fiche du commerce, la liste « Mes
// cartes » et le tunnel. Seule la carte publique `/carte/[token]` comptait
// juste. Vu du Yopper : il en a gagné deux, l'application en montre une, il la
// croit perdue.
//
// ⚠️ UNE SEULE SE DÉPENSE PAR COMMANDE, ET C'EST UN CHOIX (arbitrage d'Alex,
// 25/08) : la remise est bornée au panier, cumuler en brûlerait une pour rien.
// Ce qui manquait n'était pas le cumul, c'était de LE DIRE.
{
  // ── Les phrases, EXÉCUTÉES ────────────────────────────────────────────
  verifie('rien à dire quand il n\'en a qu\'une', libelleAutresRecompenses(1) === null)
  verifie('ni quand il n\'en a aucune', libelleAutresRecompenses(0) === null)
  const deux = libelleAutresRecompenses(2)
  verifie('avec deux, on annonce celle qui reste', /1 autre\b/.test(deux || ''))
  verifie('et on dit quand elle reviendra', /prochaine commande/.test(deux || ''))
  const trois = libelleAutresRecompenses(3)
  verifie('avec trois, il en reste deux', /2 autres\b/.test(trois || ''))
  // ⚠️ « à ta prochaine commande » serait FAUX au-delà d'une : il en faudra
  // autant de passages que de récompenses.
  verifie('et on dit qu\'elles viennent une par une', /une par une/.test(trois || ''))
  verifie('le rendez-vous ne parle pas de commande',
    !/commande/.test(libelleAutresRecompenses(2, 'rdv') || '')
    && /rendez-vous/.test(libelleAutresRecompenses(2, 'rdv') || ''))

  verifie('la carte se tait sans récompense', libelleCarteRecompenses(0, '10€ offerts') === null)
  verifie('une récompense reste au singulier',
    /ta récompense est débloquée/.test(libelleCarteRecompenses(1, '10€ offerts') || ''))
  const carte2 = libelleCarteRecompenses(2, '10€ offerts')
  verifie('deux récompenses se comptent', /2 récompenses débloquées/.test(carte2 || ''))
  // ⚠️ « CHACUNE » N'EST PAS UN ORNEMENT : le libellé décrit UNE récompense.
  // Sans ce mot, « 2 récompenses : 10€ offerts » se lit comme 10 € en tout, et
  // l'écran ment de moitié.
  verifie('et le montant est dit PAR récompense', /chacune/.test(carte2 || ''))
  const carte2Court = libelleCarteRecompenses(2, '10€ offerts', { court: true })
  verifie('la version courte compte aussi', /2 récompenses débloquées/.test(carte2Court || ''))
  // ⚠️ MESURÉ MUET : retirer « chacune » de la version COURTE laissait la
  // garde ci-dessus verte, parce qu'elle ne lisait que la version longue. Les
  // deux phrases portent le même risque, elles se vérifient toutes les deux.
  verifie('et la courte dit aussi le montant PAR récompense', /chacune/.test(carte2Court || ''))
  verifie('la version courte ne félicite pas',
    !/^Bravo/.test(libelleCarteRecompenses(1, '10€ offerts', { court: true }) || ''))

  // ── Le serveur rend le TOTAL, et il le compte en base ──────────────────
  const rs = lireCode('lib/fidelite-recompense-server.js')
  verifie('le serveur rend la récompense ET le total',
    /return \{ recompense: premiere, total:/.test(rs))
  // ⚠️ COMPTER LES LIGNES RENDUES SOUS UN `.limit()` PLAFONNE LE TOTAL en
  // silence : au-delà de la limite, le Yopper en verrait moins qu'il n'en a.
  verifie('et le total vient d\'un vrai count, pas des lignes reçues',
    /count: 'exact'/.test(rs) && !/total: liste\.length/.test(rs))
  // ⚠️ MESURÉ MUET : demander `count: 'exact'` ne suffisait pas, on pouvait le
  // demander et rendre `total: 1` quand même. La garde doit lire le CHEMIN de
  // la donnée, pas la présence de l'option.
  verifie('et il est bien LU dans la réponse de la base',
    /total: premiere \? Number\(count\)/.test(rs))
  const route = lireCode('app/api/fidelite/ma-recompense/route.js')
  verifie('la route expose le total au tunnel', /\n\s+total,/.test(route))

  // ── Les quatre écrans, nommés un par un ───────────────────────────────
  //
  // ⚠️ ON NE CHERCHE PAS LE NOM DE LA FONCTION SEUL : il est dans la ligne
  // d'import, qui verdit la garde même quand l'appel a disparu. Trois gardes
  // muettes de cette forme le 25/08. On exige donc l'appel AVEC son argument,
  // qui n'existe qu'au point de rendu.
  //
  // ⚠️ ET ON EXIGE LES DEUX APPELS DANS LES TUNNELS, pas un seul. Mesuré muet :
  // la phrase y est écrite deux fois, en CONDITION puis en RENDU, et en
  // supprimer une laissait la garde verte sur l'autre. C'est exactement la
  // garde du 25/08 qui verdissait sur le second `useResetAuRetourDePaiement`.
  // Retirer la condition affiche un bloc vide, retirer le rendu affiche un
  // bloc muet : les deux comptent.
  for (const [f, appel, minimum] of [
    ['app/commander/[slug]/page.js', 'libelleAutresRecompenses(recompensesTotal)', 2],
    ['app/commander/rdv/[slug]/page.js', "libelleAutresRecompenses(recompensesTotal, 'rdv')", 2],
    ['app/commander/CarteFideliteFiche.js', 'libelleCarteRecompenses(nbRecompenses, libelle)', 1],
    ['app/commander/page.js', 'libelleCarteRecompenses(nbRecompenses, libelle, { court: true })', 1],
  ]) {
    verifie(`${f} dit combien il en a`, lireCode(f).split(appel).length - 1 >= minimum)
  }

  // ⚠️ ET LE TOTAL EST BIEN CHARGÉ, sinon les phrases ci-dessus se tairaient
  // toujours : `libelleAutresRecompenses(0)` rend null, donc un état resté à
  // zéro donnerait un écran identique à l'ancien, sans rien signaler.
  for (const f of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    verifie(`${f} charge le total depuis la route`,
      /setRecompensesTotal\(Number\(j\.total\) \|\| 1\)/.test(lireCode(f)))
  }

  // ⚠️ LES DEUX ÉCRANS DE CARTE NE LISENT PLUS UN NOMBRE COMME UN BOOLÉEN.
  for (const f of ['app/commander/CarteFideliteFiche.js', 'app/commander/page.js']) {
    verifie(`${f} garde le nombre, pas seulement le oui/non`,
      /const nbRecompenses = Number\(carte\??\.?\.?recompenses_disponibles/.test(lireCode(f))
      || /nbRecompenses = Number\(carte/.test(lireCode(f)))
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 16. 🔴 LA REMISE OUBLIÉE PAR TOUT CE QUI PARLE D'ARGENT (26/08, test d'Alex)
// ═════════════════════════════════════════════════════════════════════════
//
// Une commande de 36 € avec 10 € de récompense annonçait 26 € à l'écran, puis
// 36 € dans le ticket, et 36 € dans la modale d'encaissement du comptoir. La
// récompense était pourtant bien consommée : le Yopper payait DEUX FOIS, en
// argent et en récompense brûlée.
//
// Une seule cause : `resteAEncaisserCommande` ne déduisait que le bon cadeau.
// C'est la source unique du montant dû, donc TOUT ce qui en découle mentait.
{
  // ── La règle, EXÉCUTÉE ────────────────────────────────────────────────
  verifie('la récompense se déduit de ce qui reste à encaisser',
    resteAEncaisserCommande({ total: 36, fidelite_remise: 10, paye_en_ligne: false }) === 26)
  verifie('elle se cumule avec le bon cadeau',
    resteAEncaisserCommande({ total: 36, fidelite_remise: 10, bon_cadeau_montant: 6, paye_en_ligne: false }) === 20)
  verifie('et jamais de solde négatif',
    resteAEncaisserCommande({ total: 8, fidelite_remise: 10, paye_en_ligne: false }) === 0)
  // ⚠️ Le piège du zéro, pour la sixième fois sur ce projet : une commande
  // sans total ne doit rien annoncer, surtout pas « 0,00 € ».
  verifie('sans total, on ne prétend rien',
    resteAEncaisserCommande({ fidelite_remise: 10, paye_en_ligne: false }) === null)
  verifie('une commande déjà payée en ligne ne redemande rien',
    resteAEncaisserCommande({ total: 36, fidelite_remise: 10, paye_en_ligne: true }) === 0)

  // ── La colonne arrive jusqu'aux quatre lecteurs ───────────────────────
  //
  // ⚠️ SANS LE `select`, LA CORRECTION EST MUETTE. `Number(undefined)` n'est
  // pas fini : la fonction retombe sur l'ancien montant, sans erreur ni log.
  // C'est le défaut le plus fréquent de ce projet.
  for (const f of [
    'app/api/emails/commande-prete/route.js',
    'app/api/cron/rappels-retrait/route.js',
    'app/api/yopper/commandes/route.js',
  ]) {
    verifie(`${f} charge fidelite_remise`, /fidelite_remise/.test(lireCode(f)))
  }
  // ⚠️ MESURÉ MUET : dans `commande-notifs`, le mot apparaît DEUX fois, dans le
  // `select` puis dans le passage au template. En retirer un laissait la garde
  // verte sur l'autre — et il faut les deux : sans la colonne on ne l'a pas,
  // sans le passage le ticket ne la voit pas. Troisième fois aujourd'hui que la
  // présence d'un mot ne prouve rien.
  //
  // ⚠️ ET COMPTER LES OCCURRENCES NE SUFFISAIT PAS NON PLUS : la ligne qui
  // transmet, `fidelite_remise: cmd.fidelite_remise`, en contient DEUX à elle
  // seule. Retirer la colonne du `select` laissait le compte à 2, donc la garde
  // verte, pour une commande qui n'aurait jamais chargé la remise. On nomme
  // donc chaque rôle par sa forme exacte.
  const notifs = lireCode('lib/commande-notifs.js')
  verifie('lib/commande-notifs.js demande la colonne à la base',
    /^\s*fidelite_remise,\s*$/m.test(notifs))
  verifie('et le ticket la reçoit bien de la commande relue',
    /fidelite_remise:\s+cmd\.fidelite_remise/.test(notifs))

  // ── Le ticket du Yopper, RENDU et relu ────────────────────────────────
  const ticket = emailCommandeConfirmee({
    yopper_prenom: 'Alexandre', commercant_nom: 'La Boutique Témoin',
    numero_commande: 'RE4', articles: [{ nom: 'Robe fleurie', quantite: 1, prix_total: 36 }],
    total: 36, fidelite_remise: 10, date_retrait: '2026-08-26',
    mode_retrait: 'retrait_boutique', commercant_categorie: 'detail',
  })
  verifie('le ticket nomme la récompense', /Récompense fidélité/.test(ticket))
  // ⚠️ L'espace avant l'euro est INSÉCABLE depuis le 28/08 : ces gardes
  // cherchent le MONTANT, pas le codet du caractère d'espacement.
  verifie('et il en montre le montant déduit', /−10,00[\s ]€/.test(ticket))
  // ⚠️ LE NET, PAS SEULEMENT LA SOUSTRACTION AFFICHÉE. C'est le chiffre que le
  // Yopper emporte au comptoir.
  verifie('le ticket dit ce qui reste réellement', /26,00[\s ]€/.test(ticket))

  const ticketSansRemise = emailCommandeConfirmee({
    yopper_prenom: 'Alexandre', commercant_nom: 'La Boutique Témoin',
    numero_commande: 'RE5', articles: [{ nom: 'Robe fleurie', quantite: 1, prix_total: 36 }],
    total: 36, date_retrait: '2026-08-26', mode_retrait: 'retrait_boutique',
  })
  verifie('et sans récompense il ne parle pas de remise',
    !/Récompense fidélité/.test(ticketSansRemise) && !/Total après remise/.test(ticketSansRemise))

  // ── L'email du COMMERÇANT, qui prépare et encaisse ────────────────────
  //
  // ⚠️ IL LISAIT LE BRUT LUI AUSSI, et pour le bon cadeau depuis bien plus
  // longtemps. Celui qui prépare la commande doit voir le même chiffre que
  // celui qui vient la chercher.
  const ticketCom = emailNouvelleCommandeCommercant({
    nom_commercant: 'La Boutique Témoin', yopper_prenom: 'Alexandre',
    numero_commande: 'RE4', articles: [{ nom: 'Robe fleurie', quantite: 1, prix_total: 36 }],
    total: 36, fidelite_remise: 10, date_retrait: '2026-08-26',
  })
  verifie('l\'email commerçant montre la récompense', /Récompense fidélité/.test(ticketCom))
  verifie('et le net qu\'il aura à encaisser', /26,00[\s ]€/.test(ticketCom))
  const ticketComBon = emailNouvelleCommandeCommercant({
    nom_commercant: 'La Boutique Témoin', yopper_prenom: 'Alexandre',
    numero_commande: 'RE5', articles: [{ nom: 'Robe fleurie', quantite: 1, prix_total: 36 }],
    total: 36, bon_cadeau_montant: 6, date_retrait: '2026-08-26',
  })
  verifie('il montre aussi le bon cadeau', /Bon cadeau/.test(ticketComBon) && /30,00[\s ]€/.test(ticketComBon))
  // ⚠️ MESURÉ MUET, QUATRIÈME FOIS AUJOURD'HUI. Chercher
  // `fidelite_remise: cmd.fidelite_remise` trouvait la ligne du ticket YOPPER
  // et restait vert quand celle du COMMERÇANT disparaissait. Les deux emails
  // partent du même fichier : il faut donc DEUX passages, pas un.
  const notifsCom = lireCode('lib/commande-notifs.js')
  verifie('la remise part vers les DEUX emails',
    notifsCom.split(/fidelite_remise:\s+cmd\.fidelite_remise/).length - 1 >= 2)
  verifie('et le bon cadeau aussi',
    notifsCom.split(/bon_cadeau_montant:\s+cmd\.bon_cadeau_montant/).length - 1 >= 2)

  // ── Les moyens de paiement : UNE règle, trois lecteurs ────────────────
  //
  // 🔴 L'écran offrait « Payer en ligne » chez un commerçant qui encaisse au
  // comptoir, puis la commande partait en `sur_place` sans Stripe. Deux copies
  // d'une même règle, dont une plus permissive.
  const comptoir = {
    stripe_account_charges_enabled: true,
    boutique_retrait_paiement: 'magasin',
    accepte_paiement_cash: false,
  }
  const retraitComptoir = modesPaiementOuverts({ commercant: comptoir, estDetail: true, modeBoutique: 'retrait' })
  verifie('un retrait payé au comptoir ferme le paiement en ligne', retraitComptoir.stripeOK === false)
  verifie('et il ouvre bien la caisse', retraitComptoir.cashOK === true)
  const expe = modesPaiementOuverts({ commercant: comptoir, estDetail: true, modeBoutique: 'expedition' })
  // ⚠️ Un colis part avant toute rencontre : il ne se paie pas au comptoir.
  verifie('une expédition ne se paie jamais sur place', expe.cashOK === false)
  verifie('et elle rouvre le paiement en ligne', expe.stripeOK === true)
  const alim = modesPaiementOuverts({
    commercant: { stripe_account_charges_enabled: true, accepte_paiement_cash: true },
    estDetail: false,
  })
  verifie('l\'alimentaire garde ses deux moyens', alim.stripeOK === true && alim.cashOK === true)

  // ⚠️ UN CHOIX FERMÉ NE SE RESPECTE PAS : c'est tout le défaut d'Alex. L'écran
  // avait « en_ligne » en mémoire, le commerçant ne l'accepte pas.
  verifie('un choix devenu impossible retombe sur ce qui existe',
    modePaiementEffectif({ choix: 'en_ligne', stripeOK: false, cashOK: true }) === 'sur_place')
  verifie('un choix possible est respecté',
    modePaiementEffectif({ choix: 'sur_place', stripeOK: true, cashOK: true }) === 'sur_place')
  verifie('sans choix, le paiement en ligne passe devant',
    modePaiementEffectif({ choix: null, stripeOK: true, cashOK: true }) === 'en_ligne')
  verifie('sans aucun moyen, on ne prétend pas en avoir un',
    modePaiementEffectif({ choix: null, stripeOK: false, cashOK: false }) === null)
  verifie('une commande entièrement couverte ne demande aucun moyen',
    modePaiementEffectif({ choix: null, stripeOK: false, cashOK: false, couvert: true }) === 'en_ligne')

  // ── Et les trois lecteurs lisent bien la fonction, sans la recopier ───
  const tunnelPaie = lireCode('app/commander/[slug]/page.js')
  verifie('le tunnel appelle la règle deux fois : au rendu ET à l\'envoi',
    tunnelPaie.split('modesPaiementOuverts({').length - 1 >= 2)
  verifie('et il n\'a plus sa copie locale de la règle boutique',
    !/stripeOK = stripeOK && p === 'en_ligne'/.test(tunnelPaie))
  const routeCmd = lireCode('app/api/stripe/checkout/create-commande/route.js')
  verifie('le serveur lit la même règle', /modesPaiementOuverts\(\{/.test(routeCmd))
  // ⚠️ ET IL REFUSE LE PAIEMENT EN LIGNE FERMÉ. Sans ça, le choix du commerçant
  // n'était tenu que par l'écran, donc par personne.
  verifie('et il refuse un paiement en ligne que le commerçant n\'a pas ouvert',
    /if \(!surPlace && !enLigneAutorise\)/.test(routeCmd))
}

// ═══ LE SOLDE SUR PLACE, EXÉCUTÉ (27/08) ═══════════════════════════════════
//
// 🔴 TROUVÉ PAR ALEX EN PRODUCTION. Deux endroits recalculaient le solde à côté
// du module, et tous deux oubliaient la remise de fidélité : l'email de
// confirmation et le rappel de la veille. Un client ayant utilisé sa récompense
// de 10 € lisait « Solde sur place 28,00 € » au lieu de 21,00 €, et le comptoir
// lui aurait réclamé 7 € de trop. C'est la famille du 25/08.
{
  const base = { prix_estime: 40, acompte_montant: 12, acompte_paye: true }

  verifie('🔴 sans récompense, le solde reste le tarif moins l\'acompte',
    soldeRdv(base) === 28, String(soldeRdv(base)))
  // Le vrai cas d'Alex : 40 € de coloration, 10 € de récompense, acompte de 30 %
  // calculé sur le NET (9 €). Il ne doit plus que 21 € au salon.
  verifie('🔴 avec 10 € de récompense, le solde tombe à 21 €',
    soldeRdv({ prix_estime: 40, fidelite_remise: 10, acompte_montant: 9, acompte_paye: true }) === 21,
    String(soldeRdv({ prix_estime: 40, fidelite_remise: 10, acompte_montant: 9, acompte_paye: true })))
  // ⚠️ LE RAPPEL DE LA VEILLE LIT L'AUTRE COLONNE. Exiger `acompte_paye` l'aurait
  // rendu muet sur l'acompte, et ce silence-là ne se voit pas.
  verifie('l\'autre colonne d\'acompte est comprise aussi',
    soldeRdv({ prix_estime: 40, fidelite_remise: 10, acompte_montant: 9, acompte_paye_en_ligne: true }) === 21)
  // ⚠️ UN ACOMPTE PRÉVU MAIS NON PAYÉ RESTE DÛ : le retrancher ferait cadeau.
  verifie('un acompte non payé ne se déduit pas',
    soldeRdv({ prix_estime: 40, fidelite_remise: 10, acompte_montant: 9, acompte_paye: false }) === 30)
  // ⚠️ `Number(null)` VAUT 0 ET PASSE LES GARDES : une prestation sur devis
  // annoncerait « 0,00 € à régler ». Piège déjà rencontré trois fois ici.
  verifie('🔴 une prestation sans prix ne rend PAS zéro',
    soldeRdv({ prix_estime: null, acompte_montant: 9, acompte_paye: true }) === null)
  verifie('une récompense plus grosse que le prix ne rend jamais négatif',
    soldeRdv({ prix_estime: 10, fidelite_remise: 30, acompte_montant: 0 }) === 0)

  // Et le gabarit, exécuté : c'est lui qui mentait au client.
  const htmlRdv = emailRdvConfirme({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins',
    prestation_nom: 'Coloration', date_rdv: '2026-08-27',
    heure_debut: '16:00', heure_fin: '17:30',
    prix_estime: 40, acompte_paye: true, acompte_montant: 9, fidelite_remise: 10,
  })
  verifie('🔴 l\'email de confirmation annonce 21,00 €, pas 28,00 €',
    // ⚠️ LES DEUX CÔTÉS TOLÈRENT L'INSÉCABLE, y compris la garde NÉGATIVE :
    // laissée en espace ordinaire, elle serait devenue toujours vraie, donc
    // muette, et c'est elle qui protège le vrai défaut du 27/08.
    /21,00[\s ]€/.test(htmlRdv) && !/28,00[\s ]€/.test(htmlRdv))
  // ⚠️ « Prix », pas « Prix estimé » (Alex, 27/08) : le prix est le prix.
  verifie('et il ne parle plus de prix ESTIMÉ', !/Prix estimé/.test(htmlRdv))

  // 🔴 LA LIGNE QUI EXPLIQUE LE DÉCOMPTE. Alex, 27/08 : « Prix 40,00 € ·
  // Acompte payé 9,00 € · Solde 21,00 € », et 40 moins 9 ne fait pas 21. Un
  // décompte qu'on ne peut pas refaire de tête se lit comme une erreur, et
  // celui qui doute réclame le montant affiché en haut.
  // ⚠️ Règle d'Alex : « affiché PARTOUT où on parle de la transaction. »
  verifie('🔴 l\'email client DIT la récompense dans le décompte',
    /Récompense fidélité/.test(htmlRdv) && /−10,00[\s ]€/.test(htmlRdv))

  const htmlPro = emailNouveauRdvCommercant({
    nom_commercant: 'Ciseaux et Soins', yopper_prenom: 'Alexandre', yopper_nom: 'V',
    prestation_nom: 'Coloration', date_rdv: '2026-08-27',
    heure_debut: '16:00', heure_fin: '17:30',
    prix_estime: 40, acompte_paye: true, acompte_montant: 9, fidelite_remise: 10,
  })
  verifie('🔴 et l\'email du COMMERÇANT aussi',
    /Récompense fidélité/.test(htmlPro) && /−10,00[\s ]€/.test(htmlPro))
  // ⚠️ RIEN QUAND IL N'Y A RIEN : une ligne « −0,00 € » vaut moins que pas de
  // ligne du tout.
  const htmlSansRemise = emailRdvConfirme({
    yopper_prenom: 'Alexandre', commercant_nom: 'Ciseaux et Soins',
    prestation_nom: 'Coloration', date_rdv: '2026-08-27',
    heure_debut: '16:00', heure_fin: '17:30',
    prix_estime: 40, acompte_paye: true, acompte_montant: 12,
  })
  verifie('sans récompense, aucune ligne parasite', !/Récompense fidélité/.test(htmlSansRemise))

  // Et la CARTE du tableau de bord, exécutée : elle lit la même colonne.
  const carte = etatPaiementRdv({
    statut: 'confirme', prix_estime: 40, fidelite_remise: 10,
    acompte_montant: 9, acompte_paye: true, date_rdv: '2099-01-01',
  })
  verifie('🔴 la carte du tableau de bord dit la récompense',
    /récompense fidélité/i.test(carte?.detail || ''), carte?.detail || '(rien)')
}

// ═══ 🔴 LA CONCORDANCE DES CHIFFRES (27/08, demandée par Alex) ═════════════
//
// 🔴 `fidelite_remise` N'EXISTAIT PAS DANS `lib/statistiques.js`. Le module de
// paiement retranchait la récompense partout ; les statistiques comptaient le
// tarif plein. Le commerçant lisait 40 € de chiffre d'affaires là où il en
// avait encaissé 30, sur les trois segments.
//
// ⚠️ LA RÉCOMPENSE SE RETRANCHE, LE BON CADEAU **NON**. Se tromper coûte cher
// dans les deux sens : la récompense n'entre jamais dans la caisse, le bon
// cadeau y est DÉJÀ entré le jour où il a été acheté.
{
  const cmdBrute  = { statut: 'recupere', total: 40 }
  const cmdRemise = { statut: 'recupere', total: 40, fidelite_remise: 10 }
  const cmdBon    = { statut: 'recupere', total: 40, bon_cadeau_montant: 10 }

  verifie('sans récompense, la commande vaut son total', valeurCommande(cmdBrute) === 40)
  verifie('🔴 avec 10 € de récompense, elle ne vaut plus que 30',
    valeurCommande(cmdRemise) === 30, String(valeurCommande(cmdRemise)))
  // ⚠️ LA GARDE QUI PROTÈGE DE LA SUR-CORRECTION.
  verifie('🔴 mais un bon cadeau NE se retranche PAS du chiffre d\'affaires',
    valeurCommande(cmdBon) === 40, String(valeurCommande(cmdBon)))

  const rdvRemise = { statut: 'honore', prix_estime: 40, fidelite_remise: 10, acompte_montant: 9, acompte_paye: true }
  verifie('🔴 le rendez-vous suit la même règle', valeurRdv(rdvRemise) === 30, String(valeurRdv(rdvRemise)))
  // ⚠️ L'ACOMPTE EST DÉJÀ NET : le retrancher une seconde fois enlèverait la
  // remise deux fois d'un montant qui ne la contient plus.
  verifie('une prestation sans prix se rabat sur l\'acompte, sans le réduire',
    valeurRdv({ statut: 'honore', prix_estime: null, fidelite_remise: 10, acompte_montant: 9 }) === 9)

  // Et le total, bout à bout : 30 de produits + 30 de prestation.
  const ca = chiffreAffaires([cmdRemise], [rdvRemise], [])
  verifie('🔴 le chiffre d\'affaires concorde avec ce qui est encaissé',
    ca.produits === 30 && ca.prestations === 30,
    `produits ${ca.produits}, prestations ${ca.prestations}`)

  // ⚠️ ET LA COLONNE DOIT ARRIVER JUSQU'À EUX. La règle la plus juste ne sert à
  // rien si le select ne la demande pas : `Number(undefined || 0)` vaut 0, et la
  // correction serait restée sans effet sans la moindre erreur.
  const routeStats = readFileSync(new URL('../app/api/dashboard/statistiques/route.js', import.meta.url), 'utf8')
  // ⚠️ LA GARDE VISE LA COLONNE, PAS LA LISTE ENTIÈRE. Ancrée sur le `select`
  // recopié mot pour mot, elle rougissait le 02/09 pour une colonne AJOUTÉE à
  // côté (`stripe_refund_amount`), donc pour une amélioration. Une garde qui
  // punit l'ajout finit par être affaiblie au lieu d'être écoutée.
  const selectStats = (table) => routeStats.match(
    new RegExp(`from\\('${table}'\\)\\s*(?:\\/\\/[^\\n]*\\n\\s*)*\\.select\\('([^']*)'`))?.[1] || ''
  verifie('🔴 la route des stats charge la remise des commandes',
    /\bfidelite_remise\b/.test(selectStats('commandes')), selectStats('commandes'))
  verifie('🔴 et celle des rendez-vous',
    /\bfidelite_remise\b/.test(selectStats('rdv_reservations')), selectStats('rdv_reservations'))
}

// ═══ 🔴 LE TUNNEL RDV + PRODUITS CONNAÎT LA FIDÉLITÉ (27/08) ═══════════════
//
// 🔴 IL NE LA CONNAISSAIT PAS. Son frère `create-rdv-acompte` chargeait la
// récompense depuis le 24/08 ; celui-ci, non. Dès qu'un PRODUIT accompagnait le
// rendez-vous, l'écran annonçait « Payer 30,90 € » et le serveur encaissait
// 33,90 €. La récompense n'était pas consommée, et le client la retrouvait sur
// sa carte après l'avoir « utilisée ».
//
// ⚠️ L'ÉCRAN CALCULE, LE SERVEUR DÉCIDE. Une remise qui n'existe que côté
// client est une promesse sans débiteur.
{
  const lire = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
  const tunnel = lire('app/api/stripe/checkout/create-rdv-commande/route.js')
  const ecran = lire('app/commander/rdv/[slug]/page.js')

  verifie('🔴 le tunnel lit l\'identifiant de récompense',
    /fidelite_recompense_id,/.test(tunnel))
  verifie('🔴 et il la RECHARGE côté serveur, sans croire l\'écran',
    /chargerRecompensePourYopper\(supabase, \{/.test(tunnel))
  // ⚠️ IDENTITÉ PROUVÉE PAR LE JETON, jamais `client_email` : il est envoyé par
  // le client et ne prouve rien. Sans ça, connaître l'identifiant d'une
  // récompense suffirait à dépenser celle d'un autre.
  verifie('🔴 l\'identité est PROUVÉE avant toute remise',
    /identiteProuvee\(request\)/.test(tunnel))
  // ⚠️ L'ACOMPTE SE CALCULE SUR LE NET, sinon le Yopper avance un acompte assis
  // sur un prix qu'il ne paie pas. C'est la règle F22.
  // ⚠️ MÊME REMARQUE QUE POUR SON FRÈRE : la formule vit désormais dans
  // `lib/tunnel-rdv-montants.js`, et elle y est EXÉCUTÉE par `verif:tunnel-rdv`
  // sur le cas F22. Recopier la formule ici la ferait rougir à chaque
  // déménagement sans jamais rien prouver de plus.
  verifie('🔴 l\'acompte vient du module unique, pas d\'une recopie',
    /ventilerTunnelRdv\(/.test(tunnel) && !/Math\.round\(prixBase \* acomptePct\)/.test(tunnel))
  // ⚠️ SANS LES MÉTADONNÉES, LE WEBHOOK NE SAIT RIEN : il écrit
  // `fidelite_remise: 0` et ne consomme jamais la récompense.
  // ⚠️ LA REMISE VOYAGE TOUJOURS, MAIS PLUS EN ENTIER (30/08). Depuis que la
  // récompense paie aussi les produits, elle se ventile : la part PRESTATION
  // part vers le rendez-vous, la part PRODUITS reste sur la commande. Envoyer
  // le total ici la compterait deux fois, une de chaque côté du lien.
  verifie('🔴 la remise voyage jusqu\'au webhook',
    /fidelite_remise: String\(vent\.recompenseSurPresta\)/.test(tunnel)
    && /fidelite_recompense_id: String\(recompense\.id\)/.test(tunnel))
  verifie('🔴 et la part produits reste sur la commande',
    /fidelite_remise: vent\.recompenseSurProduits/.test(tunnel))

  // Et l'écran l'envoie vraiment : une route qui sait lire ne sert à rien si
  // personne ne lui parle (le piège du 23/08, contrôlé des DEUX côtés).
  const appel = ecran.slice(ecran.indexOf('create-rdv-commande'), ecran.indexOf('create-rdv-commande') + 1600)
  verifie('🔴 et l\'écran envoie l\'identifiant à CE tunnel-là',
    /fidelite_recompense_id: recompenseFid\.id/.test(appel))
}

// ═══ 🔴 CE QUI SE PERD QUAND LA RÉCOMPENSE VAUT PLUS QUE LE PANIER ════════
//
// Trouvé par Alex en production le 28/08 : 10 € de récompense sur un panier à
// 8 € déduisaient 8 €, brûlaient la récompense ENTIÈRE, et les 2 € partaient
// sans un mot, sous un « 10€ offerts sur ton prochain achat » qui disait
// l'inverse. Décision d'Alex : on ne bloque pas, on ne reporte pas, ON LE DIT.
{
  const R10 = { type: 'remise_montant', valeur: 10 }
  const R5 = { type: 'remise_montant', valeur: 5 }

  egal('10 € sur un panier à 8 € : 2 € se perdent', perteRecompense(R10, 8), 2)
  egal('10 € sur un panier à 30 € : rien ne se perd', perteRecompense(R10, 30), 0)
  // ⚠️ LE PLANCHER STRIPE PERD AUSSI, et je ne l'avais pas anticipé : sur
  // 5,30 €, la remise est rabotée à 4,80 € pour laisser 0,50 € encaissable.
  egal('le plancher Stripe perd 0,20 € sur 5,30 €', perteRecompense(R5, 5.30), 0.2)

  const phrase = libellePerteRecompense(R10, 8)
  verifie('la phrase dit les TROIS chiffres',
    /10,00[\s ]€/.test(phrase) && /8,00[\s ]€/.test(phrase) && /2,00[\s ]€/.test(phrase), phrase)
  // ⚠️ PERSONNE NE CHERCHE UNE INFORMATION : dire la perte sans donner la
  // sortie ne sert à rien.
  verifie('et elle donne le geste', /Ajoute un article/.test(phrase), phrase)
  egal('sans perte, aucune phrase', libellePerteRecompense(R10, 30), null)
  verifie('le mot change selon l\'écran',
    /ta prestation/.test(libellePerteRecompense(R10, 8, 'ta prestation')))

  // ⚠️ ET LES DEUX ÉCRANS L'AFFICHENT. Recopiée, elle aurait divergé ; absente
  // d'un des deux, la moitié des Yoppers perdraient toujours en silence.
  // ⚠️ ANCRÉE SUR LA CONDITION ENTIÈRE, `{appel(...) && (`. Deux ancres plus
  // faibles ont échoué avant celle-ci, toutes deux trouvées par la mesure :
  //   • le nom seul survivait à `{false && libellePerteRecompense(...)` ;
  //   • l'accolade ouvrante aussi, parce que le JSX appelle la fonction DEUX
  //     fois, dans la condition ET dans le corps : la seconde occurrence
  //     maintenait la garde verte à elle seule.
  // Sixième garde molle de la journée. Aucune n'a été trouvée en relisant.
  for (const chemin of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
    verifie(`${chemin.split('/')[2]} affiche l'avertissement`,
      /\{libellePerteRecompense\(recompenseFid,[^\n]*\) && \(/.test(lireCode(chemin)))
  }

  // 🔴 ET LA PHRASE DOIT MESURER LA MÊME ASSIETTE QUE LA REMISE (30/08).
  //
  // Alex a demandé si ce message était à jour partout. Il ne l'était pas : le
  // tunnel rendez-vous le calculait encore sur `prixBase`, la prestation
  // seule, alors que la récompense venait de passer au panier entier LE MATIN
  // MÊME. Une récompense de 10 € sur une prestation à 6 € plus 21,90 € de
  // produits annonçait « 4,00 € perdus » sans qu'un centime ne se perde, et
  // dissuadait le Yopper d'utiliser ce qui lui revenait entièrement.
  //
  // ⚠️ J'AVAIS CHANGÉ LE CALCUL SANS CHANGER LA PHRASE QUI LE COMMENTE. La
  // garde ci-dessus voyait bien l'avertissement, mais jamais SUR QUOI il
  // portait : elle vérifiait qu'on parle, pas qu'on dise vrai.
  for (const [chemin, assiette] of [
    ['app/commander/[slug]/page.js', 'totalAvecFrais()'],
    ['app/commander/rdv/[slug]/page.js', 'assietteRecompense'],
  ]) {
    const src = lireCode(chemin)
    // ⚠️ ON NORMALISE DES DEUX CÔTÉS plutôt que de raffiner le motif : `[^,)]+`
    // coupe `totalAvecFrais()` à sa parenthèse, et la garde rougissait sur du
    // code parfaitement juste. Une expression d'assiette se compare à son NOM,
    // jamais à sa ponctuation.
    const nom = (s) => s.trim().replace(/[()\s]+$/, '')
    const appels = [...src.matchAll(/libellePerteRecompense\(recompenseFid,\s*([^,)]+)/g)].map(m => nom(m[1]))
    verifie(`${chemin.split('/')[2]} : l'avertissement mesure la bonne assiette`,
      appels.length > 0 && appels.every(a => a === nom(assiette)), appels.join(' | ') || 'aucun appel')
    // ⚠️ ET LA MÊME QUE LA REMISE RÉELLEMENT APPLIQUÉE : deux assiettes
    // différentes pour le même avantage, c'est la divergence garantie.
    const remises = [...src.matchAll(/calculerRemiseRecompense\(recompenseFid,\s*([^,)]+)/g)].map(m => nom(m[1]))
    verifie(`${chemin.split('/')[2]} : la remise et l'avertissement partagent l'assiette`,
      remises.every(r => appels.includes(r)), `remise sur ${remises.join(' | ')}`)
  }
}

if (echecs.length > 0) {
  console.log(`\n${ok} vérifications passées, ${echecs.length} en échec.\n`)
  console.log('ÉCHECS :')
  echecs.forEach(e => console.log(`  ✕ ${e}`))
  process.exit(1)
}
console.log(`\n${ok} vérifications passées, 0 en échec.`)
console.log('Récompense de fidélité verte.')
