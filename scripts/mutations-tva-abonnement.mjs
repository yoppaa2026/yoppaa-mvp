// HARNAIS DE MUTATION — LA TVA DE L ABONNEMENT (20/09)
//
// 🔴 CE QU ON MESURE. La page d abonnement promettait « la TVA applicable sera
// ajoutee au moment du paiement » alors que NI `automatic_tax` NI
// `default_tax_rates` n existaient dans le depot. Stripe prelevait le montant
// nu ; une facture sans TVA est reputee TVA comprise, donc 16,45 € seraient
// restes sur 19,90 €. Personne ne l aurait vu avant la premiere declaration
// trimestrielle, et pour tout le monde en meme temps.
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-tva-abonnement.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:lancement'
const MODULE = 'lib/plans.js'

const BILLING = 'lib/stripe-billing.js'
const PAGE    = 'app/dashboard/abonnement/page.js'
const SMS     = 'app/api/fidelite/sms-packs/checkout/route.js'
const SHOP    = 'app/api/accompagnement/checkout/route.js'
const SIGNUP  = 'app/signup/page.js'
const CONCOURS = 'app/concours/page.js'

const MUTATIONS = [
  // ─── LE CALCUL ──────────────────────────────────────────────────────────
  // ⚠️ MUTER LA CONSTANTE MESURE DEUX CHOSES A LA FOIS : que les montants en
  // descendent vraiment, et que personne n a recopie 121 en dur dans le calcul
  // (auquel cas la garde anti-divergence rougirait, elle, et pas les montants).
  { nom: '🔴 le taux belge passe a 6 % : les montants doivent suivre, ou c est qu ils sont recopies',
    de: 'export const TVA_ABONNEMENT_POURCENT = 21',
    vers: 'export const TVA_ABONNEMENT_POURCENT = 6' },

  { nom: '🔴 LE DEFAUT D ORIGINE : plus aucune TVA, le montant nu redevient le montant facture',
    de: 'export const TVA_ABONNEMENT_POURCENT = 21',
    vers: 'export const TVA_ABONNEMENT_POURCENT = 0' },

  // 🔴 LE PIEGE DU ZERO, HUITIEME FOIS. `!htva` est faux pour 0 comme pour
  // `null` : Exister, gratuit, n aurait plus de prix du tout.
  { nom: '🔴 le piege du zero : Exister perd son prix parce que 0 est falsy',
    de: '  if (!Number.isFinite(htva)) return null',
    vers: '  if (!htva) return null' },

  // ⚠️ ET L INVERSE : `!= null` laisse passer NaN, l infini et les chaines.
  // `Number(null)` vaut 0, et une absence afficherait « gratuit » sur un
  // forfait payant.
  { nom: '🔴 une absence redevient un zero : « gratuit » s affiche sur un forfait payant',
    de: '  if (!Number.isFinite(htva)) return null',
    vers: '  if (htva === undefined) return null' },

  { nom: '⚠️ l arrondi disparait : l ecran affiche 24,078999999999997 €',
    de: '  return Math.round(htva * (100 + TVA_ABONNEMENT_POURCENT)) / 100',
    vers: '  return htva * (100 + TVA_ABONNEMENT_POURCENT) / 100' },

  { nom: '⚠️ l arrondi tombe a l euro : 24,08 € devient 24,00 €',
    de: '  return Math.round(htva * (100 + TVA_ABONNEMENT_POURCENT)) / 100',
    vers: '  return Math.round(htva * (100 + TVA_ABONNEMENT_POURCENT) / 100)' },

  // ─── LE TAXRATE : LE BON MONDE, OU RIEN ─────────────────────────────────
  { nom: '🔴 LE DEFAUT QUI COUTE : le taux de l autre monde sert de repli, et il ne taxe rien',
    fichier: BILLING,
    de: '  const taxRateId = process.env[envKey]',
    vers: '  const taxRateId = process.env[envKey] || process.env.STRIPE_TAX_RATE_BE_LIVE' },

  { nom: '🔴 le taux manquant n arrete plus rien : on encaisse sans TVA',
    fichier: BILLING,
    de: '  if (!taxRateId) {',
    vers: '  if (false) {' },

  // ⚠️ LA LECON DU 17/09, REMISE : `isStripeTestMode()` repond « live » sans
  // cle. Le brancher ici choisirait le taux de production sur une installation
  // qui n a pas de Stripe du tout.
  { nom: '🔴 le monde se decide par isStripeTestMode : pas de cle, donc « live »',
    fichier: BILLING,
    de: '  const mode = modePlateforme()',
    vers: "  const mode = isStripeTestMode() ? MODE_TEST : 'live'" },

  { nom: '🔴 pas de cle, on devine « live » au lieu de refuser',
    fichier: BILLING,
    de: "    throw new Error('Configuration Stripe incomplète : STRIPE_SECRET_KEY manquante ou non reconnue')",
    vers: "    return 'LIVE'" },

  // ─── LES DEUX VOIES ─────────────────────────────────────────────────────
  { nom: '🔴 la voie Checkout ne taxe plus : qui souscrit depuis son tableau de bord passe au travers',
    fichier: BILLING,
    de: '    default_tax_rates: [getStripeTaxRateId()],',
    vers: '' },

  { nom: '🔴 la voie du KYB ne taxe plus : ce sont les cinq premiers commercants',
    fichier: BILLING,
    de: '    default_tax_rates: [tvaBelge],',
    vers: '' },

  // ⚠️ DEUX POSES DANS LA MEME VOIE FONT UN COMPTE JUSTE ET LAISSENT L AUTRE
  // NUE : c est exactement ce qu un compteur seul ne verrait pas.
  { nom: '🔴 le compte est bon mais une voie est nue : deux poses du meme cote',
    fichier: BILLING,
    de: '    default_tax_rates: [tvaBelge],',
    vers: '    metadata_tva_posee: true,' },

  // ─── LES FRERES : LES AUTRES VENTES D AVCOTECH ──────────────────────────
  // 🔴 LE DEFAUT D ORIGINE DES DEUX COTES : le prix est annonce HTVA et
  // personne n ajoute la TVA, parce que trois commentaires affirmaient qu elle
  // etait « portee par le Price Stripe ».
  { nom: '🔴 les packs SMS repassent au prix nu, sans TVA',
    fichier: SMS,
    de: '      line_items: [{ price: priceId, quantity: 1, tax_rates: [tvaBelge] }],',
    vers: '      line_items: [{ price: priceId, quantity: 1 }],' },

  { nom: '🔴 la boutique repasse au prix nu, sans TVA',
    fichier: SHOP,
    de: '    const lineItems = choisis.map(p => ({ price: getStripePriceIdProduitBoutique(p.envKey), quantity: 1, tax_rates: [tvaBelge] }))',
    vers: '    const lineItems = choisis.map(p => ({ price: getStripePriceIdProduitBoutique(p.envKey), quantity: 1 }))' },

  // 🔴 LE TAUX QUI N EST PLUS RESOLU AVANT L ECRITURE ROUVRE LE TROU DE LA
  // COMMANDE FANTOME : une ligne « paiement en attente » ecrite en base, puis
  // une exception, et un paiement qui n arrive jamais. Les deux routes
  // resolvent deja leurs Price AVANT d ecrire, exactement pour ca.
  //
  // ⚠️ LA MUTATION SUPPRIME L APPEL PLUTOT QUE DE LE DEPLACER, parce qu une
  // ancre ne peut pas contenir de saut de ligne (les fichiers sont en CRLF).
  // Elle mesure donc la meme garde par son autre bout : sans appel, l ordre
  // n est plus verifiable, et `tvaBelge` partirait a `undefined` chez Stripe.
  { nom: '🔴 le taux des SMS n est plus resolu : Stripe recoit un taux indefini',
    fichier: SMS,
    de: '    const tvaBelge = getStripeTaxRateId()',
    vers: '    const tvaBelge = undefined' },

  { nom: '🔴 le taux de la boutique n est plus resolu : Stripe recoit un taux indefini',
    fichier: SHOP,
    de: '    const tvaBelge = getStripeTaxRateId()',
    vers: '    const tvaBelge = undefined' },

  // ─── L ECRAN ────────────────────────────────────────────────────────────
  { nom: '🔴 LA PROMESSE D ORIGINE REVIENT : une TVA « selon votre pays » que rien ne calcule',
    fichier: PAGE,
    de: 'Les prix sont HTVA : la TVA belge de {TVA_ABONNEMENT_POURCENT} % s&rsquo;ajoute au moment du paiement.',
    vers: 'Tous les prix sont HTVA. La TVA applicable sera ajoutée au moment du paiement selon votre pays et votre statut TVA.' },

  // ⚠️ LE TAUX RECOPIE. La garde doit resister au fait que le nom de la
  // constante reste dans l import : c est le piege du mot trouve ailleurs.
  { nom: '🔴 le taux est recopie en dur dans la page, et il cessera de suivre la facture',
    fichier: PAGE,
    de: 'la TVA belge de {TVA_ABONNEMENT_POURCENT} % s&rsquo;ajoute',
    vers: 'la TVA belge de 21 % s&rsquo;ajoute' },

  { nom: '⚠️ le montant reellement debite disparait de la carte',
    fichier: PAGE,
    de: '          soit {euros(ttc)} TVA comprise',
    vers: '          soit {euros(ttc)} hors taxes' },

  // ─── AUCUNE CARTE NULLE PART (decision d Alex, 21/09) ───────────────────
  //
  // 🔴 CE LOT MESURE UNE ABSENCE, ET C EST LE PIRE GENRE DE DEFAUT. Stripe
  // collecte un moyen de paiement PAR DEFAUT en mode abonnement, essai ou pas.
  // Retirer la ligne ne casse rien, ne leve rien, ne s apercoit nulle part :
  // le formulaire redemande simplement une carte, et les commercants
  // recommencent a choisir Exister par peur. D ou la mutation qui remet la
  // valeur par defaut REELLE de Stripe plutot qu une valeur inventee.
  { nom: '🔴 LE DEFAUT D ORIGINE : le Checkout redemande une carte, et rien ne le dit',
    fichier: BILLING,
    de: "payment_method_collection: 'if_required',",
    vers: "payment_method_collection: 'always'," },

  // ⚠️ LA DECISION RETIRE LA CARTE, ELLE NE VIDE PAS LE FORMULAIRE : une
  // facture belge doit porter l adresse du client.
  { nom: '🔴 l adresse de facturation cesse d etre exigee : les factures partent incompletes',
    fichier: BILLING,
    de: "billing_address_collection: 'required',",
    vers: "billing_address_collection: 'auto'," },

  // ─── L ECRAN QUI FABRIQUAIT LA PEUR ─────────────────────────────────────
  //
  // 🔴 CONSTAT D ALEX : « ils veulent du vendre offert jusqu au 8 janvier mais
  // ils choisissent Exister de peur que ca ne soit pas gratuit ». Trois
  // commercants reels (Le Bistrologue, Iconic, Mozz Art) l ont fait.
  //
  // ⚠️ ON MUTE UNE SEULE DES DEUX NOTES, et c est tout l interet : une garde
  // qui CHERCHE la phrase la trouverait sur l autre forfait et resterait verte.
  // C est le piege du mot trouve ailleurs, attrape en COMPTANT.
  { nom: '🔴 un seul des deux forfaits payants porte la note : l autre continue de faire reculer',
    fichier: SIGNUP,
    de: 'note: NOTE_SANS_CARTE,',
    vers: "note: 'Sans engagement, résiliable en 1 clic'," },

  { nom: '🔴 la note repasse au vocabulaire d abonnement, qui suppose l abonnement qui fait peur',
    fichier: SIGNUP,
    de: 'Aucune carte demandée.',
    vers: 'Sans engagement.' },

  // 🔴 SANS LA SORTIE NOMMEE, « aucune carte » se lit comme un piege : il
  // manque ce qui arrive s il ne veut pas continuer.
  { nom: '🔴 la sortie n est plus nommee : il ne sait plus qu il garderait sa fiche',
    fichier: SIGNUP,
    de: 'tu repasses en Exister et tu gardes ta fiche',
    vers: 'tu peux résilier en un clic' },

  { nom: '🔴 le prix reprend le dessus : l oeil retombe sur le montant au lieu de l offre',
    fichier: SIGNUP,
    de: 'puis {euros(p.mensuel)} HTVA/mois',
    vers: '{euros(p.mensuel)} HTVA/mois' },

  { nom: '🔴 LA PHRASE D ORIGINE REVIENT : un paiement brandi au moment de l hesitation',
    fichier: SIGNUP,
    de: 's’ajoutera sur la première facture',
    vers: 's’ajoutera au moment du paiement' },

  // ⚠️ MEME PIEGE QUE SUR LA PAGE D ABONNEMENT : le nom de la constante reste
  // dans l import, donc une garde qui se contente de le chercher reste verte.
  { nom: '🔴 le taux de l inscription est recopie en dur, il cessera de suivre la facture',
    fichier: SIGNUP,
    de: 'de {TVA_ABONNEMENT_POURCENT} %',
    vers: 'de 21 %' },

  // ─── CE QUE LE CHOIX ENGAGE (21/09) ─────────────────────────────────────
  //
  // 🔴 DEUX ERREURS REELLES, UNE SEULE CAUSE : l information existait deja,
  // dans le sous-titre de la carte, en 12 px gris. Trois commercants ont pris
  // Exister « de peur que ca ne soit pas gratuit », et ICONIC, boutique de
  // vetements, s est inscrite en Alimentaire parce qu elle y a lu « commande »
  // et « livraison », c est-a-dire ce qu elle voulait FAIRE.
  { nom: '🔴 un seul encart subsiste : l autre choix redevient muet',
    fichier: SIGNUP,
    de: '<EncartChoix titre="Choisis d’après ce que tu vends">',
    vers: '<div>' },

  // ⚠️ LE SOUS-TITRE GRIS QUI REVIENT PAR-DESSUS : deux blocs qui disent la
  // meme chose, dont un que personne ne lit. La situation d avant, en pire.
  { nom: '🔴 le sous-titre gris revient sur une carte qui porte deja son encart',
    fichier: SIGNUP,
    de: '<Card titre="Choisis ta formule">',
    vers: '<Card titre="Choisis ta formule" sous="Tu pourras changer plus tard depuis ton tableau de bord.">' },

  // 🔴 LA PROMESSE FAUSSE. Verifie le 21/09 : la colonne `categorie` n est
  // ecrite NULLE PART dans le tableau de bord, seule l equipe peut la corriger.
  { nom: '🔴 l ecran laisse croire qu une categorie se corrige toute seule',
    fichier: SIGNUP,
    de: 'Tu ne pourras pas la changer toi-même ensuite : en cas de doute',
    vers: 'Tu pourras la changer plus tard : en cas de doute' },

  // ⚠️ ON MUTE LE LIEN, PAS LA PHRASE D A COTE. Ma premiere version remplacait
  // « ecris-nous a » et laissait la balise juste apres : l adresse restait dans
  // la tranche, et la garde restait verte. Une mutation doit retirer CE QUE LA
  // GARDE REGARDE.
  { nom: '🔴 le choix definitif est annonce sans dire a qui s adresser',
    fichier: SIGNUP,
    de: '<a href="mailto:hello@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: \'none\' }}>hello@yoppaa.app</a>',
    vers: 'notre équipe' },

  // ⚠️ LA DATE RECOPIEE DANS L ENCART. `libelleDernierJourGratuit` sert deja
  // sur les pastilles des cartes : une garde qui se contenterait de chercher le
  // nom resterait verte. Elle vise la tranche de l encart.
  { nom: '🔴 la date de l encart est recopiee a la main',
    fichier: SIGNUP,
    de: 'Jusqu’au {libelleDernierJourGratuit()} inclus, les trois formules',
    vers: 'Jusqu’au 8 janvier 2027 inclus, les trois formules' },

  // 🔴 LE SOUS-TITRE QUI A PERDU ICONIC : il promettait une capacite la ou il
  // devait nommer un metier. En corriger deux sur trois laisserait justement la
  // porte par laquelle elle est passee.
  { nom: '🔴 une categorie sur trois promet de nouveau une capacite, et c est la sienne',
    fichier: SIGNUP,
    de: 'sous="Tu vends à manger ou à boire"',
    vers: 'sous="Commande à l’avance et livraison"' },

  // ═══ 24/09 : LE REGLEMENT DU CONCOURS ══════════════════════════════════
  //
  // 🔴 DOCUMENT CONTRACTUEL. Rien dans le produit ne depend de ses dates ni de
  // ses montants : ils se contredisent en silence, et l article 13 interdit
  // d en retirer quoi que ce soit apres le debut.
  //
  // 🔴 LES SEPT JOURS SONT UNE DECISION D ALEX (15/09) : sans eux, celui qui
  // commente le dernier soir compte les fiches et connait presque la reponse.
  { nom: '🔴 le constat se rapproche de la derniere participation',
    fichier: CONCOURS,
    de: "constat: 'samedi 7 novembre 2026 à 23 h 59'",
    vers: "constat: 'dimanche 1 novembre 2026 à 23 h 59'",
    garde: 'sept jours séparent la dernière participation du constat' },

  { nom: '🔴 le concours se ferme avant de s ouvrir',
    fichier: CONCOURS,
    de: "debut: 'jeudi 24 septembre 2026 à 20 h'",
    vers: "debut: 'jeudi 24 décembre 2026 à 20 h'",
    garde: 'et le concours ouvre avant de se fermer' },

  // 🔴 LE DEFAUT DU 24/09 : une liste de sept noms relevee le 15/09, dont
  // AUCUN n existait plus neuf jours plus tard.
  { nom: '🔴 l annexe republie une liste de noms, qui se perimera',
    fichier: CONCOURS,
    de: "            <P>Une fiche de démonstration se reconnaît",
    vers: "            <P>COMMERCES_DEMONSTRATION. Une fiche de démonstration se reconnaît",
    garde: 'l’annexe ne publie plus de liste de commerces' },

  { nom: '⚠️ l exclusion ne vaut plus si les fiches sont encore en ligne',
    fichier: CONCOURS,
    de: "qu'elles soient encore publiées ou non au moment du constat",
    vers: 'une fois retirées',
    garde: 'et l’exclusion vaut même si les fiches sont encore publiées' },

  // 🔴 UN CONTRAT NE PROMET PAS UNE DATE QU ON NE MAITRISE PAS : la revue d un
  // store peut retarder le retrait des fiches de demonstration.
  { nom: '🔴 le reglement repromet de retirer les fiches a une date',
    fichier: CONCOURS,
    de: "            <P>Au moment du constat, l'organisateur publie",
    vers: "            <P>Les fiches de test sont retirées de l'application au plus tard le 1er octobre 2026. Au moment du constat, l'organisateur publie",
    garde: 'le règlement ne promet plus de retirer les fiches à une date' },

  { nom: '⚠️ un seuil de commerces remonte a son ancienne valeur',
    fichier: CONCOURS,
    de: 'à partir de 75 commerces',
    vers: 'à partir de 125 commerces',
    garde: 'les seuils de commerces sont 50, 75 et 100' },

  // 🔴 4 bons de 50 € + 300 € = 500 €, soit EXACTEMENT le plafond annonce.
  // Monter un montant sans monter le plafond ferait promettre plus que ce
  // qu on s autorise a donner.
  { nom: '🔴 un montant depasse le plafond annonce',
    fichier: CONCOURS,
    de: 'un bon de trois cents euros',
    vers: 'un bon de quatre cents euros',
    garde: 'et les montants n’ont pas bougé' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
