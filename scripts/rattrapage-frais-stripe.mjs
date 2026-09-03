// ─── RATTRAPAGE DES FRAIS STRIPE SUR LES VENTES DÉJÀ ENCAISSÉES ─────────────
//
// ⚠️ POURQUOI CE SCRIPT EXISTE. `abonnements.stripe_frais` a été ajouté le
// 17/08 : les contrats vendus AVANT n'ont donc aucun frais enregistré, et la
// Comptabilité les affiche à 0,00 €. Ce n'est pas faux au sens strict (on ne
// sait pas), mais c'est illisible en démonstration chez un commerçant, où un
// écran doit montrer ce que l'encaissement coûte réellement.
//
// Il rattrape aussi les commandes et les rendez-vous dont les frais n'ont
// jamais été relevés, pour la même raison : une amélioration qui touche
// d'autres endroits de l'application s'y applique aussi (règle d'Alex, 17/08).
//
// ⚠️ LE PIÈGE DU DOUBLE COMPTAGE, ET C'EST LA RAISON DE LA GARDE CENTRALE.
// Dans le tunnel unique, UN SEUL paiement Stripe porte l'acompte du rendez-vous
// ET le prix des produits. Les frais y sont VENTILÉS au prorata (défaut corrigé
// le 05/08). Un rattrapage aveugle écrirait les frais COMPLETS des deux côtés,
// et la comptabilité du commerçant compterait deux fois la même dépense.
// Ce script REFUSE donc de toucher un paiement qui finance plus d'un objet, et
// il le dit à l'écran plutôt que de le taire.
//
// ⚠️ ET IL N'ÉCRIT JAMAIS ZÉRO. Stripe met parfois quelques minutes à
// constituer la transaction de solde : `recupererFraisStripe` rend `null` dans
// ce cas, et un zéro écrit en base ressemblerait à une transaction sans frais,
// ce qui est faux et invérifiable après coup.
//
// AUCUNE DONNÉE PERSONNELLE N'EST LUE : seulement des identifiants, des
// références de paiement et des montants.
//
// UTILISATION (à lancer par Alex, jamais par l'assistant) :
//
//   node --env-file=.env.local --experimental-loader ./scripts/alias-loader.mjs \
//        scripts/rattrapage-frais-stripe.mjs
//
// Ajouter `--ecrire` pour écrire vraiment. Sans ce drapeau, le script se
// contente de DIRE ce qu'il ferait : on regarde d'abord, on écrit ensuite.

import { createClient } from '@supabase/supabase-js'
import { recupererFraisStripe, sessionBonCadeau } from '@/lib/stripe-frais'
import { regimeBonPourCommerce } from '@/lib/bons-cadeaux-server'

const ECRIRE = process.argv.includes('--ecrire')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !cle) {
  console.error('Variables Supabase absentes. Lance le script avec --env-file=.env.local')
  process.exit(1)
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Clé Stripe absente. Lance le script avec --env-file=.env.local')
  process.exit(1)
}

const db = createClient(url, cle, { auth: { persistSession: false } })

// Les trois tables où un paiement Stripe peut avoir laissé des frais non
// relevés. `montant` ne sert qu'à l'affichage, pour reconnaître la ligne.
const TABLES = [
  { nom: 'abonnements',      montant: 'prix' },
  { nom: 'commandes',        montant: 'total' },
  { nom: 'rdv_reservations', montant: 'prix_estime' },
]

const euros = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

// ─── LES BONS CADEAUX, DONT LA VENTE N'ÉCRIVAIT AUCUNE LIGNE COMPTABLE ──────
//
// 🔴 Trouvé le 03/09 : le paiement d'un bon est un direct charge sur le compte
// Stripe du commerçant, mais la vente n'écrivait que dans `bons_cadeaux`. Quinze
// bons vendus, aucune écriture, et la colonne « encaissé en ligne » ne pouvait
// pas se rapprocher du relevé Stripe.
//
// ⚠️ CES BONS-LÀ N'ONT QU'UN `stripe_session_id` : ni identifiant de paiement,
// ni date d'encaissement, puisque les colonnes n'existaient pas. Sans le détour
// par la session, ils resteraient invisibles pour toujours.
//
// ⚠️ LA DATE VIENT DE STRIPE, JAMAIS DE L'HORLOGE DE CETTE MACHINE. Un
// rattrapage lancé aujourd'hui daterait sinon des ventes d'août d'aujourd'hui,
// et les ferait changer de mois dans le journal comptable.
//
// ⚠️ AUCUNE DONNÉE PERSONNELLE : on ne lit ni l'email de l'acheteur, ni celui du
// bénéficiaire, ni le code du bon.
//
// ⚠️ ET UN BON NE PARTAGE JAMAIS SON PAIEMENT : aucune garde de ventilation
// n'est nécessaire ici, contrairement au tunnel unique plus haut.
async function rattraperBons() {
  console.log('\n── LES BONS CADEAUX ──')

  const { data: bons, error } = await db
    .from('bons_cadeaux')
    .select('id, commercant_id, stripe_session_id, stripe_payment_intent_id, paye_le, tva_regime, montant_initial')
    .neq('statut', 'paiement_en_attente')
    .is('stripe_frais', null)
  if (error) {
    console.error(`  ✕ lecture des bons impossible : ${error.message}`)
    return
  }
  console.log(`${(bons || []).length} bon(s) vendu(s) sans frais relevés.`)
  if (!bons || bons.length === 0) return

  const ids = [...new Set(bons.map(b => b.commercant_id).filter(Boolean))]
  const { data: coms } = await db
    .from('commercants')
    .select('id, stripe_account_id, tva_taux_defaut, bons_tva_regime')
    .in('id', ids)
  const parId = Object.fromEntries((coms || []).map(c => [c.id, c]))

  // Le régime coûte deux lectures de catalogue : on ne le redemande pas pour
  // chaque bon d'un même commerce.
  const regimes = new Map()
  let ecrits = 0, sansCompte = 0, sansReponse = 0

  for (const b of bons) {
    const com = parId[b.commercant_id]
    const court = String(b.id).slice(0, 8)
    if (!com?.stripe_account_id) {
      console.log(`  · bon ${court} — pas de compte Stripe connecté, ignoré`)
      sansCompte++
      continue
    }

    const maj = {}
    let pi = b.stripe_payment_intent_id
    let paye = b.paye_le
    if ((!pi || !paye) && b.stripe_session_id) {
      const s = await sessionBonCadeau(b.stripe_session_id, com.stripe_account_id)
      if (s) {
        pi = pi || s.paymentIntentId
        paye = paye || (s.created ? new Date(s.created * 1000).toISOString() : null)
      }
    }
    if (pi && pi !== b.stripe_payment_intent_id) maj.stripe_payment_intent_id = pi
    if (paye && paye !== b.paye_le) maj.paye_le = paye

    if (!b.tva_regime) {
      if (!regimes.has(com.id)) regimes.set(com.id, await regimeBonPourCommerce(db, com))
      const { regime, taux } = regimes.get(com.id)
      maj.tva_regime = regime
      maj.tva_taux = taux
    }

    // ⚠️ ON N'ÉCRIT JAMAIS ZÉRO : `null` veut dire « jamais relevé », et un zéro
    // ressemblerait à une transaction sans frais.
    const frais = pi ? await recupererFraisStripe(pi, com.stripe_account_id) : null
    if (frais) {
      maj.stripe_frais = frais.frais
      maj.stripe_net = frais.net
    } else {
      sansReponse++
    }

    if (Object.keys(maj).length === 0) {
      console.log(`  · bon ${court} — rien à compléter`)
      continue
    }
    const jour = (maj.paye_le || b.paye_le || '').slice(0, 10) || 'date inconnue'
    console.log(`  ✓ bon ${court} · ${euros(b.montant_initial)} · ${jour}`
      + ` · ${maj.tva_regime || b.tva_regime || 'régime inchangé'}`
      + (frais ? ` · frais ${euros(frais.frais)}` : ' · frais non lisibles, laissés vides'))
    if (ECRIRE) {
      const { error: errUp } = await db.from('bons_cadeaux').update(maj).eq('id', b.id)
      if (errUp) { console.log(`      ✕ écriture refusée : ${errUp.message}`); continue }
    }
    ecrits++
  }

  console.log(`\nBons ${ECRIRE ? 'complétés' : 'à compléter'} : ${ecrits}`)
  console.log(`Frais non lisibles : ${sansReponse} · sans compte connecté : ${sansCompte}`)
}

async function main() {
  console.log(ECRIRE ? '── ÉCRITURE RÉELLE ──' : '── SIMULATION (ajoute --ecrire pour écrire) ──')

  // 1. On ramasse tout ce qui a un paiement et pas de frais.
  const candidats = []
  for (const t of TABLES) {
    const { data, error } = await db
      .from(t.nom)
      .select(`id, commercant_id, stripe_payment_intent_id, ${t.montant}`)
      .not('stripe_payment_intent_id', 'is', null)
      .is('stripe_frais', null)
    if (error) {
      console.error(`  ✕ lecture de ${t.nom} impossible : ${error.message}`)
      continue
    }
    for (const l of data || []) {
      candidats.push({ table: t.nom, id: l.id, commercant_id: l.commercant_id,
        pi: l.stripe_payment_intent_id, montant: l[t.montant] })
    }
  }
  console.log(`\n${candidats.length} ligne(s) sans frais relevés.`)

  // 2. ⚠️ LA GARDE CONTRE LE DOUBLE COMPTAGE. Un paiement qui finance plusieurs
  // objets a des frais VENTILÉS : on n'y touche pas, et on le dit.
  const parPaiement = new Map()
  for (const c of candidats) parPaiement.set(c.pi, (parPaiement.get(c.pi) || 0) + 1)
  const partages = candidats.filter(c => parPaiement.get(c.pi) > 1)
  const seuls = candidats.filter(c => parPaiement.get(c.pi) === 1)
  if (partages.length > 0) {
    console.log(`\n⚠️ ${partages.length} ligne(s) ÉCARTÉE(S) : leur paiement finance plusieurs objets,`)
    console.log('   leurs frais doivent être ventilés au prorata et non recopiés en entier.')
    for (const c of partages) console.log(`   · ${c.table} ${String(c.id).slice(0, 8)} · ${c.pi}`)
  }

  // 3. Le compte Stripe du commerçant : en Direct Charge, les frais vivent chez
  // LUI. Interroger l'API sans se placer sur son compte ne rend pas une erreur,
  // ça rend un vide.
  const idsCommerces = [...new Set(seuls.map(c => c.commercant_id).filter(Boolean))]
  const comptes = {}
  if (idsCommerces.length > 0) {
    const { data } = await db.from('commercants').select('id, stripe_account_id').in('id', idsCommerces)
    for (const c of data || []) comptes[c.id] = c.stripe_account_id
  }

  let ecrits = 0
  let sansReponse = 0
  let sansCompte = 0
  for (const c of seuls) {
    const compte = comptes[c.commercant_id]
    if (!compte) {
      console.log(`  · ${c.table} ${String(c.id).slice(0, 8)} — pas de compte Stripe connecté, ignoré`)
      sansCompte++
      continue
    }
    const frais = await recupererFraisStripe(c.pi, compte)
    if (!frais) {
      console.log(`  · ${c.table} ${String(c.id).slice(0, 8)} — Stripe ne rend rien, laissé vide`)
      sansReponse++
      continue
    }
    console.log(`  ✓ ${c.table} ${String(c.id).slice(0, 8)} · ${euros(c.montant)} → frais ${euros(frais.frais)}, net ${euros(frais.net)}`)
    if (ECRIRE) {
      const { error } = await db.from(c.table)
        .update({ stripe_frais: frais.frais, stripe_net: frais.net })
        .eq('id', c.id)
      if (error) { console.log(`      ✕ écriture refusée : ${error.message}`); continue }
    }
    ecrits++
  }

  console.log(`\n${ECRIRE ? 'Écrites' : 'À écrire'} : ${ecrits}`)
  console.log(`Sans réponse de Stripe : ${sansReponse} · sans compte connecté : ${sansCompte} · écartées : ${partages.length}`)

  await rattraperBons()

  if (!ECRIRE) console.log('\nRelance avec --ecrire pour appliquer.')
}

main().catch(e => { console.error(e?.message || e); process.exit(1) })
