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
import { recupererFraisStripe } from '@/lib/stripe-frais'

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
  if (!ECRIRE && ecrits > 0) console.log('\nRelance avec --ecrire pour appliquer.')
}

main().catch(e => { console.error(e?.message || e); process.exit(1) })
