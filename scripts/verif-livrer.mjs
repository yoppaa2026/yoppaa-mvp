// BANC : LIVRER UNE COMMANDE (équipe, étape 4, 01/10).
//
// Le livreur marque « en route » puis « livrée » depuis le Poste, avec la même
// question d'argent que le comptoir ; le patron fait la même chose depuis son
// tableau de bord. UNE route serveur pour les deux (`/api/livraison/livrer`),
// UNE règle (`lib/livraison-geste.js`).
//
// Ce banc EXÉCUTE la règle, puis la fonction serveur sur une base en mémoire
// (qui rend `null` sur une écriture sans ligne, comme `maybeSingle` de
// Supabase), puis vise les endroits qui l'appellent.
//
//   npm run verif:livrer

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { gesteLivraisonPermis, champsLivraison, GESTES_LIVRAISON } from '../lib/livraison-geste.js'
import { livrerCommande, REFUS_LIVRAISON } from '../lib/livraison-serveur.js'
import { livraisonPourLeLivreur } from '../lib/equipe-poste.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

const MAINTENANT = new Date('2026-10-01T17:45:00Z')
const commande = (x = {}) => ({
  id: 'k1', commercant_id: 'c1', mode_retrait: 'livraison', statut: 'pret', statut_livraison: null,
  total: 36, paye_en_ligne: false, bon_cadeau_montant: null, fidelite_remise: 10, encaisse_mode: null, ...x,
})

// ═══ 1) QUAND LE GESTE EST PERMIS ═══════════════════════════════════════════
{
  v('deux gestes, dans l’ordre', GESTES_LIVRAISON.join(',') === 'en_livraison,livree')
  v('🔴 une livraison prête peut partir', gesteLivraisonPermis(commande(), 'en_livraison'))
  v('🔴 une livraison prête peut être livrée directement (le livreur a oublié « Partir »)', gesteLivraisonPermis(commande(), 'livree'))
  v('🔴 en route : on ne repart pas', !gesteLivraisonPermis(commande({ statut_livraison: 'en_livraison' }), 'en_livraison'))
  v('en route : on livre', gesteLivraisonPermis(commande({ statut_livraison: 'en_livraison' }), 'livree'))
  v('🔴 livrée : plus rien', !gesteLivraisonPermis(commande({ statut_livraison: 'livree' }), 'livree') && !gesteLivraisonPermis(commande({ statut_livraison: 'livree' }), 'en_livraison'))
  v('🔴 une commande encore en préparation ne part pas', !gesteLivraisonPermis(commande({ statut: 'en_preparation' }), 'en_livraison') && !gesteLivraisonPermis(commande({ statut: 'en_preparation' }), 'livree'))
  v('🔴 une commande déjà remise ne se relivre pas', !gesteLivraisonPermis(commande({ statut: 'recupere' }), 'livree'))
  v('🔴 un retrait n’est pas une livraison', !gesteLivraisonPermis(commande({ mode_retrait: 'retrait' }), 'livree'))
  v('un geste inconnu est refusé', !gesteLivraisonPermis(commande(), 'expediee') && !gesteLivraisonPermis(null, 'livree'))
}

// ═══ 2) CE QUE LE GESTE ÉCRIT ═══════════════════════════════════════════════
{
  const route = champsLivraison(commande(), 'en_livraison', { maintenant: MAINTENANT })
  v('🔴 « en route » n’écrit que l’étape (la commande reste prête)',
    JSON.stringify(route.champs) === JSON.stringify({ statut_livraison: 'en_livraison' }) && route.refus === null, JSON.stringify(route))

  const payee = champsLivraison(commande({ paye_en_ligne: true }), 'livree', { maintenant: MAINTENANT })
  v('🔴 « livrée » termine la commande (chiffre d’affaires, fidélité, avis)',
    payee.champs?.statut_livraison === 'livree' && payee.champs?.statut === 'recupere', JSON.stringify(payee))
  v('payée en ligne : aucune colonne d’argent', !('encaisse_mode' in (payee.champs || {})))

  const sansChoix = champsLivraison(commande(), 'livree', { maintenant: MAINTENANT })
  v('🔴 payée à la porte, sans dire comment : refusé', sansChoix.champs === null && /comment le client a payé/i.test(sansChoix.refus || ''), JSON.stringify(sansChoix))
  const especes = champsLivraison(commande(), 'livree', { encaissement: 'especes', maintenant: MAINTENANT })
  v('🔴 en espèces : le montant RÉEL, récompense déduite, calculé ici',
    especes.champs?.encaisse_mode === 'especes' && especes.champs?.encaisse_montant === 26 && especes.champs?.encaisse_le === MAINTENANT.toISOString(), JSON.stringify(especes))
  const rien = champsLivraison(commande(), 'livree', { encaissement: 'sans_paiement', maintenant: MAINTENANT })
  v('rien encaissé : écrit « rien » et 0 €, et la commande est quand même livrée',
    rien.champs?.encaisse_mode === 'rien' && rien.champs?.encaisse_montant === 0 && rien.champs?.statut === 'recupere')
  const dejaEncaissee = champsLivraison(commande({ encaisse_mode: 'terminal' }), 'livree', { maintenant: MAINTENANT })
  v('🔴 déjà encaissée : on ne réécrit jamais l’argent', dejaEncaissee.refus === null && !('encaisse_mode' in (dejaEncaissee.champs || {})))
  const interdite = champsLivraison(commande({ statut: 'en_preparation' }), 'livree', { encaissement: 'especes' })
  v('🔴 un geste refusé n’écrit rien', interdite.champs === null && !!interdite.refus)
}

// ═══ 3) LA FONCTION SERVEUR, SUR UNE BASE EN MÉMOIRE ════════════════════════
// ⚠️ `maybeSingle` rend la ligne OU `null`, lecture comme écriture : c'est sur
// ce `null` que repose le refus « déjà traitée par quelqu'un d'autre ».
const fauxDb = (tables, { avantEcriture = null } = {}) => {
  const trace = { ecritures: 0 }
  return {
    trace,
    from(table) {
      const filtres = []
      let maj = null
      let unique = false
      const b = {
        select() { return b },
        eq(c, x) { filtres.push(l => l[c] === x); return b },
        is(c, x) { filtres.push(l => (l[c] ?? null) === x); return b },
        update(m) { maj = m; return b },
        maybeSingle() { unique = true; return b },
        then(res, rej) {
          if (maj && avantEcriture) avantEcriture(tables)
          const lignes = (tables[table] || []).filter(l => filtres.every(f => f(l)))
          let data
          if (maj) {
            lignes.forEach(l => Object.assign(l, maj))
            trace.ecritures += lignes.length
            data = lignes.map(l => ({ id: l.id }))
          } else {
            data = lignes.map(l => ({ ...l }))
          }
          return Promise.resolve({ data: unique ? (data[0] || null) : data, error: null }).then(res, rej)
        },
      }
      return b
    },
  }
}
const base = (x = {}) => ({ commandes: [commande(x), { ...commande(), id: 'k2', commercant_id: 'c2' }] })
const livrer = async (tables, args, options) => {
  const db = fauxDb(tables, options)
  const res = await livrerCommande(db, { commandeId: 'k1', commercantId: 'c1', maintenant: MAINTENANT, ...args })
  return { res, db, k1: tables.commandes.find(c => c.id === 'k1') }
}

{
  const { res, db, k1 } = await livrer(base(), { vers: 'en_livraison' })
  v('🔴 en route : une ligne écrite, la commande reste prête', res.ok && db.trace.ecritures === 1 && k1.statut_livraison === 'en_livraison' && k1.statut === 'pret', JSON.stringify(res))
}
{
  const { res, db, k1 } = await livrer(base({ statut_livraison: 'en_livraison' }), { vers: 'livree', encaissement: 'terminal' })
  v('🔴 livrée et encaissée au terminal, en UNE écriture',
    res.ok && db.trace.ecritures === 1 && k1.statut === 'recupere' && k1.statut_livraison === 'livree' && k1.encaisse_mode === 'terminal' && k1.encaisse_montant === 26, JSON.stringify(k1))
  v('l’écran reçoit ce qui a été écrit', res.champs?.encaisse_montant === 26 && res.avant?.statut_livraison === 'en_livraison')
}
{
  const { res, db } = await livrer(base(), { vers: 'livree' })
  v('🔴 payée à la porte sans le moyen : refusée, rien d’écrit', !res.ok && res.code === 'encaissement' && db.trace.ecritures === 0 && REFUS_LIVRAISON.encaissement === 400)
}
{
  const { res, db } = await livrer(base(), { vers: 'livree', encaissement: 'especes', commandeId: 'k2' })
  v('🔴 la commande d’un AUTRE commerce est introuvable', !res.ok && res.code === 'introuvable' && db.trace.ecritures === 0)
}
{
  // 🔴 LE PATRON ET LE LIVREUR TOUCHENT « LIVRÉE » ENSEMBLE.
  const { res, db } = await livrer(base({ statut_livraison: 'en_livraison' }), { vers: 'livree', encaissement: 'especes' },
    { avantEcriture: (t) => { Object.assign(t.commandes[0], { statut_livraison: 'livree', statut: 'recupere', encaisse_mode: 'terminal' }) } })
  v('🔴 traitée entre la lecture et l’écriture : refusée, l’argent n’est pas écrit deux fois',
    !res.ok && res.code === 'deja_fait' && db.trace.ecritures === 0, JSON.stringify(res))
}
{
  // ⚠️ CHAQUE FILTRE DE L'ÉCRITURE A SON SCÉNARIO. Le précédent changeait les
  // deux colonnes à la fois : chaque filtre y cachait l'autre.
  // 1. Deux « Partir » : seule l'étape a changé, la commande est toujours prête.
  const deuxPartir = await livrer(base(), { vers: 'en_livraison' },
    { avantEcriture: (t) => { t.commandes[0].statut_livraison = 'en_livraison' } })
  v('🔴 deux « Partir » ensemble : le second est refusé (un seul « ta commande arrive »)',
    !deuxPartir.res.ok && deuxPartir.res.code === 'deja_fait' && deuxPartir.db.trace.ecritures === 0, JSON.stringify(deuxPartir.res))
  // 2. Annulée pendant le geste : seule la commande a changé.
  const annulee = await livrer(base(), { vers: 'livree', encaissement: 'especes' },
    { avantEcriture: (t) => { t.commandes[0].statut = 'annulee_client_refund' } })
  v('🔴 annulée pendant le geste : rien n’est encaissé',
    !annulee.res.ok && annulee.res.code === 'deja_fait' && annulee.db.trace.ecritures === 0, JSON.stringify(annulee.res))
}
{
  const { res, db } = await livrer(base({ statut: 'en_preparation' }), { vers: 'en_livraison' })
  v('🔴 pas prête : refusée', !res.ok && res.code === 'refuse' && db.trace.ecritures === 0 && REFUS_LIVRAISON.refuse === 409)
  const inv = await livrer(base(), { vers: 'expediee' })
  v('un geste inconnu : invalide', !inv.res.ok && inv.res.code === 'invalide' && inv.db.trace.ecritures === 0)
}

// ═══ 4) LE LIVREUR VOIT SES BOUTONS ═════════════════════════════════════════
{
  const vue = livraisonPourLeLivreur({ ...commande(), date_commande: '2026-10-01', client_nom: 'Marc Dupont', commande_articles: [] })
  v('🔴 la vue du livreur suffit à la règle (sinon aucun bouton ne s’affiche)',
    gesteLivraisonPermis(vue, 'en_livraison') && gesteLivraisonPermis(vue, 'livree'), JSON.stringify(vue))
  v('elle porte le montant à encaisser', vue.a_encaisser === 26)
}

// ═══ 5) CEUX QUI L'APPELLENT ════════════════════════════════════════════════
{
  const route = code('app/api/livraison/livrer/route.js')
  v('🔴 la route exige la case « livraisons » (le patron passe toujours)', /gardeLigneEquipe\(request, admin, 'commandes', commande_id, 'livraisons'\)/.test(route))
  v('🔴 le commerce vient de la garde, jamais du corps', /commercantId: verdict\.commercant\.id,/.test(route) && !/commercant_id[^\n]*request/.test(route))
  v('le geste du livreur va au journal', /action: 'livraison_statut'/.test(route) && /journaliserGeste\(admin, verdict,/.test(route))

  const statut = code('app/api/livraison/statut/route.js')
  v('🔴 le message au client s’ouvre au livreur', /gardeLigneEquipe\(request, supabase, 'commandes', commande_id, \['commandes', 'livraisons'\]\)/.test(statut))
  v('🔴 et ne raconte que ce qui est écrit en base',
    /adresse_livraison, statut_livraison,/.test(statut) && /if \(cmd\.statut_livraison !== statut_livraison\) \{\s*return NextResponse\.json\(\{ ok: false/.test(statut)
    && statut.indexOf('if (cmd.statut_livraison !== statut_livraison)') < statut.indexOf('envoyerAuCommercant('))

  const bord = code('app/dashboard/page.js')
  const i = bord.indexOf('async function changerStatutLivraison(')
  const corps = i >= 0 ? bord.slice(i, bord.indexOf('async function optimiserTournee(', i)) : ''
  v('la livraison du tableau de bord a été retrouvée', corps.length > 300, String(corps.length))
  v('🔴 le tableau de bord n’écrit plus la livraison depuis le navigateur', !/supabase\.from\('commandes'\)\.update/.test(corps) && /postPro\('\/api\/livraison\/livrer'/.test(corps))
  v('🔴 il envoie le CHOIX, pas le montant', /champs\.encaisse_mode === 'rien' \? 'sans_paiement' : champs\.encaisse_mode/.test(corps) && !/encaisse_montant/.test(corps.slice(corps.indexOf("postPro('/api/livraison/livrer'"), corps.indexOf("postPro('/api/livraison/livrer'") + 200)))
  v('🔴 un refus du serveur se dit et n’avance rien', /if \(!j\?\.ok\) \{[\s\S]{0,300}alert\([\s\S]{0,300}return\s*\}/.test(corps))

  const poste = code('app/equipe/PosteEquipe.js')
  const k = poste.indexOf('const gestesLivraison = {')
  const gl = k >= 0 ? poste.slice(k, poste.indexOf('const gestesCommande = {', k)) : ''
  v('les gestes du livreur ont été retrouvés', gl.length > 500, String(gl.length))
  v('🔴 payée à la porte : la question d’argent du comptoir', /if \(Number\(l\.a_encaisser\) > 0\) \{\s*const choix = await confirmer\(questionEncaissement\(/.test(gl))
  v('🔴 sinon une confirmation (« Livrée » prévient le client)', /if \(choix !== 'oui'\) return/.test(gl))
  v('🔴 livrée : la fidélité, puis le message au client', gl.indexOf("prevenir('/api/fidelite/crediter'") > gl.indexOf("statut_livraison: 'livree', encaissement")
    && gl.indexOf("prevenir('/api/livraison/statut', { commande_id: l.id, statut_livraison: 'livree' }") > 0)
  v('🔴 seul un membre avec la case voit les boutons', /<Livraisons livraisons=\{etat\.livraisons\} gestes=\{etat\.droits\?\.livraisons \? gestesLivraison : null\} enCours=\{enCours\}\/>/.test(poste))
  v('🔴 les boutons suivent la règle partagée', /\{gesteLivraisonPermis\(l, 'en_livraison'\) && \(/.test(poste) && /\{gesteLivraisonPermis\(l, 'livree'\) && \(/.test(poste))
}

console.log(`\nLivrer une commande : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
