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
  // ⚠️ QUATRE DEPUIS LE 05/10 (I5, décision d'Alex) : « retirée au magasin ».
  v('quatre gestes : partir, livrer, absent, retirée au magasin',
    GESTES_LIVRAISON.join(',') === 'en_livraison,livree,absent,retiree_magasin')
  v('🔴 « absent » seulement EN ROUTE (avant le départ, personne n’a sonné)',
    gesteLivraisonPermis(commande({ statut_livraison: 'en_livraison' }), 'absent') && !gesteLivraisonPermis(commande(), 'absent')
    && !gesteLivraisonPermis(commande({ statut_livraison: 'livree' }), 'absent') && !gesteLivraisonPermis(commande({ statut_livraison: 'en_livraison', statut: 'recupere' }), 'absent'))
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
  const absent = champsLivraison(commande({ statut_livraison: 'en_livraison' }), 'absent', { encaissement: 'especes' })
  v('🔴 « absent » : la commande redevient prête à partir, et AUCUN argent ne bouge',
    JSON.stringify(absent.champs) === JSON.stringify({ statut_livraison: null }) && absent.refus === null, JSON.stringify(absent))
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
  const { res, db, k1 } = await livrer(base({ statut_livraison: 'en_livraison' }), { vers: 'absent' })
  v('🔴 absent : une écriture, la commande reste prête et peut repartir',
    res.ok && db.trace.ecritures === 1 && k1.statut === 'pret' && k1.statut_livraison === null && !k1.encaisse_mode, JSON.stringify(k1))
  const deja = await livrer(base({ statut_livraison: 'en_livraison' }), { vers: 'absent' },
    { avantEcriture: (t) => { Object.assign(t.commandes[0], { statut_livraison: 'livree', statut: 'recupere' }) } })
  v('🔴 livrée entre-temps : « absent » est refusé', !deja.res.ok && deja.res.code === 'deja_fait' && deja.db.trace.ecritures === 0)
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
  // ⚠️ REPOINTÉE LE 06/10 (décision d'Alex) : « Retirée au magasin » est un
  // geste de comptoir, ouvert aussi à la case « Commandes ». Les autres étapes
  // restent à la case « Livraisons » : un membre sans elle est refusé (403).
  v('🔴 la route exige la case « livraisons » (le patron passe toujours)',
    /gardeLigneEquipe\(request, admin, 'commandes', commande_id, \['livraisons', 'commandes'\]\)/.test(route)
    && /if \(verdict\.role === 'membre' && !verdict\.permis\?\.livraisons && statut_livraison !== 'retiree_magasin'\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'accès refusé' \}, \{ status: 403 \}\)/.test(route))
  v('🔴 le commerce vient de la garde, jamais du corps', /commercantId: verdict\.commercant\.id,/.test(route) && !/commercant_id[^\n]*request/.test(route))
  v('le geste du livreur va au journal', /action: 'livraison_statut'/.test(route) && /journaliserGeste\(admin, verdict,/.test(route))
  v('🔴 « absent » prévient le client APRÈS l’écriture réussie, et seulement là',
    /if \(statut_livraison === 'absent'\) \{\s*const p = await prevenirClientAbsent\(admin, commande_id\)/.test(route)
    && route.indexOf('prevenirClientAbsent(admin') > route.indexOf('if (!r.ok) return'))
  // ⚠️ AUCUNE AUTRE PORTE : une route qui pourrait l'appeler sans geste
  // enverrait « personne n'a ouvert » à volonté.
  const { readdirSync, statSync } = await import('node:fs')
  const appelants = []
  const parcourir = (dossier) => {
    for (const n of readdirSync(new URL(`../${dossier}`, import.meta.url))) {
      const chemin = `${dossier}/${n}`
      if (statSync(new URL(`../${chemin}`, import.meta.url)).isDirectory()) parcourir(chemin)
      else if (/\.js$/.test(n) && /prevenirClientAbsent\(/.test(code(chemin))) appelants.push(chemin)
    }
  }
  parcourir('app')
  v('🔴 une seule route envoie « personne n’a ouvert »', appelants.join(',') === 'app/api/livraison/livrer/route.js', appelants.join(','))
  // Le message part, EXÉCUTÉ sur de faux envois.
  const { prevenirClientAbsent } = await import('../lib/livraison-absent-serveur.js')
  const tablesAbsent = () => ({
    commandes: [{ id: 'k1', numero_commande: 7, numero_prefixe: 'LI', client_email: 'lea@exemple.be', client_nom: 'Léa Martin', adresse_livraison: 'Rue 1, Mettet', commercant: { nom: 'Momo', telephone: '071 12 34 56' } }],
    clients: [{ id: 'cli1', email: 'lea@exemple.be' }],
  })
  const envois = { emails: [], pushs: [] }
  const faux = {
    envoyerEmail: async (m) => { envois.emails.push(m); return { ok: true } },
    envoyerPush: async (id, m) => { envois.pushs.push({ id, ...m }); return { ok: true } },
  }
  const p = await prevenirClientAbsent(fauxDb(tablesAbsent()), 'k1', faux)
  v('🔴 le client absent reçoit un email, à SON adresse, avec le numéro du commerce',
    p.email && envois.emails.length === 1 && envois.emails[0].to === 'lea@exemple.be' && /071 12 34 56/.test(envois.emails[0].html), JSON.stringify(p))
  v('🔴 ET une notification, avec le numéro aussi', p.push && envois.pushs.length === 1 && envois.pushs[0].id === 'cli1' && /071 12 34 56/.test(envois.pushs[0].contents))
  const sansEmail = tablesAbsent(); sansEmail.commandes[0].client_email = null
  const avant = envois.emails.length + envois.pushs.length
  const p2 = await prevenirClientAbsent(fauxDb(sansEmail), 'k1', faux)
  v('sans adresse : rien ne part, et l’écran le saura', !p2.email && !p2.push && envois.emails.length + envois.pushs.length === avant)
  const p3 = await prevenirClientAbsent(fauxDb(tablesAbsent()), 'k1', { envoyerEmail: async () => ({ ok: false, error: 'resend KO' }), envoyerPush: async () => ({ ok: false }) })
  v('🔴 un envoi raté se dit « pas prévenu » (le livreur appelle alors)', p3.email === false && p3.push === false)

  const statut = code('app/api/livraison/statut/route.js')
  v('🔴 le message au client s’ouvre au livreur', /gardeLigneEquipe\(request, supabase, 'commandes', commande_id, \['commandes', 'livraisons'\]\)/.test(statut))
  // ⚠️ REPOINTÉE LE 06/10 : la garde lit aussi le statut de la COMMANDE (une
  // commande annulée en tournée gardait `en_livraison`), via `annonceConforme`
  // (lib/notif-statut.js), exécutée au banc livraison.
  v('🔴 et ne raconte que ce qui est écrit en base',
    /adresse_livraison, statut_livraison, statut, mode_retrait,/.test(statut) && /if \(!annonceConforme\(cmd, statut_livraison\)\) \{\s*return NextResponse\.json\(\{ ok: false/.test(statut)
    && statut.indexOf('if (!annonceConforme(cmd, statut_livraison))') < statut.indexOf('envoyerAuCommercant('))
  v('🔴 l’email « ta commande arrive » qui n’est pas parti se dit (502)',
    /emailParti = !!envoi\?\.ok/.test(statut) && /\(emailDu && !emailParti\)[\s\S]{0,200}status: 502/.test(statut))

  const bord = code('app/dashboard/page.js')
  const i = bord.indexOf('async function changerStatutLivraison(')
  const corps = i >= 0 ? bord.slice(i, bord.indexOf('async function optimiserTournee(', i)) : ''
  v('la livraison du tableau de bord a été retrouvée', corps.length > 300, String(corps.length))
  v('🔴 le tableau de bord n’écrit plus la livraison depuis le navigateur', !/supabase\.from\('commandes'\)\.update/.test(corps) && /postPro\('\/api\/livraison\/livrer'/.test(corps))
  v('🔴 il envoie le CHOIX, pas le montant', /champs\.encaisse_mode === 'rien' \? 'sans_paiement' : champs\.encaisse_mode/.test(corps) && !/encaisse_montant/.test(corps.slice(corps.indexOf("postPro('/api/livraison/livrer'"), corps.indexOf("postPro('/api/livraison/livrer'") + 200)))
  // 🔴 AJOUTÉE LE 06/10 (mutation restée VERTE) : le changement de statut d'une
  // COMMANDE envoie le même choix au serveur, qui refuse « rien ». La garde
  // ci-dessus ne lit que la livraison : on COMPTE les deux traductions.
  v('🔴 « rien » devient « sans_paiement » dans les DEUX gestes du tableau de bord',
    (bord.match(/champs\.encaisse_mode === 'rien' \? 'sans_paiement' : champs\.encaisse_mode/g) || []).length === 2)
  v('🔴 un refus du serveur se dit et n’avance rien', /if \(!j\?\.ok\) \{[\s\S]{0,300}alert\([\s\S]{0,300}return\s*\}/.test(corps))
  v('🔴 absent : on dit au commerçant si le client est prévenu, et on ne renvoie pas « en route »',
    /if \(statutLivraison === 'absent'\) \{[\s\S]{0,200}j\.client_prevenu[\s\S]{0,700}return\s*\}/.test(corps)
    && corps.indexOf("if (statutLivraison === 'absent')") < corps.indexOf("postPro('/api/livraison/statut'"))
  v('🔴 le bouton « Client absent » n’apparaît qu’en route',
    /\{estLivraison && commande\.statut === 'pret' && statutLiv === 'en_livraison' && \(\s*<button onClick=\{async \(\) => \{\s*if \(await confirme\(confirmationSimple\(\{\s*titre: 'Personne à la porte \?'/.test(bord))
  const statutRoute = code('app/api/livraison/statut/route.js')
  v('🔴 la route des messages refuse « absent » (il ne part que du serveur)', /\['en_livraison', 'livree'\]\.includes\(statut_livraison\)/.test(statutRoute))

  const poste = code('app/equipe/PosteEquipe.js')
  const k = poste.indexOf('const gestesLivraison = {')
  const gl = k >= 0 ? poste.slice(k, poste.indexOf('const gestesCommande = {', k)) : ''
  v('les gestes du livreur ont été retrouvés', gl.length > 500, String(gl.length))
  // ⚠️ DANS LE BLOC « LIVRÉE » SEULEMENT : le geste « absent », juste après,
  // porte la même ligne, et la garde verdissait sur lui (mesuré par mutation).
  const kl = gl.indexOf('livree: (l) => geste(')
  const glLivree = kl >= 0 ? gl.slice(kl, gl.indexOf('absent: (l) => geste(', kl)) : ''
  // 🔴 REPOINTÉE LE 06/10 (mutation restée VERTE) : elle lisait tout `gl`, où
  // « Retirée au magasin » porte la même question d'argent. « Livrée » pouvait
  // la perdre, la garde la trouvait chez le voisin. Elle vise le bloc « livrée ».
  v('🔴 payée à la porte : la question d’argent du comptoir', /if \(Number\(l\.a_encaisser\) > 0\) \{\s*const choix = await confirmer\(questionEncaissement\(/.test(glLivree))
  v('🔴 sinon une confirmation (« Livrée » prévient le client)', glLivree.length > 200 && /if \(choix !== 'oui'\) return/.test(glLivree), String(glLivree.length))
  // ⚠️ REPOINTÉE LE 06/10. La fidélité d'une livraison est créditée PAR LE
  // SERVEUR (`livraison/livrer`), plus par l'écran. Et l'ancienne garde était
  // COMPLICE : `gl.indexOf(...)` trouvait l'appel du RETRAIT AU COMPTOIR, plus
  // loin dans le fichier, et restait verte quoi qu'il arrive au bloc « livrée ».
  v('🔴 livrée : plus de crédit écran, le message au client part après',
    !/prevenir\('\/api\/fidelite\/crediter'/.test(glLivree)
    && glLivree.indexOf("prevenir('/api/livraison/statut', { commande_id: l.id, statut_livraison: 'livree' }") > glLivree.indexOf("statut_livraison: 'livree', encaissement"))
  {
    const routeLivrer = code('app/api/livraison/livrer/route.js')
    v('🔴 livrée ou retirée au magasin : le SERVEUR crédite la fidélité',
      /if \(statut_livraison === 'livree' \|\| statut_livraison === 'retiree_magasin'\) \{\s*await crediterFideliteCommande\(admin, commande_id, '\[livraison\/livrer\]'\)/.test(routeLivrer))
  }
  v('🔴 seul un membre avec la case voit les boutons', /<Livraisons livraisons=\{etat\.livraisons\} gestes=\{etat\.droits\?\.livraisons \? gestesLivraison : null\} enCours=\{enCours\}\/>/.test(poste))
  // ⚠️ REPOINTÉE LE 06/10 : chaque bouton vérifie AUSSI que son geste est
  // donné (la case « Commandes » seule ne reçoit que « Retirée au magasin »).
  v('🔴 les boutons suivent la règle partagée',
    /\{gestes\?\.partir && gesteLivraisonPermis\(l, 'en_livraison'\) && \(/.test(poste) && /\{gestes\?\.livree && gesteLivraisonPermis\(l, 'livree'\) && \(/.test(poste)
    && /\{gestes\?\.absent && gesteLivraisonPermis\(l, 'absent'\) && \(/.test(poste) && /\{gestes\?\.retireeMagasin && gesteLivraisonPermis\(l, 'retiree_magasin'\) && \(/.test(poste))
  v('🔴 la case « Commandes » seule ne reçoit que « Retirée au magasin »',
    /const gestesLivraisonComptoir = \{ retireeMagasin: gestesLivraison\.retireeMagasin \}/.test(poste)
    && /gestesLivraison=\{etat\.droits\?\.livraisons \? gestesLivraison : \(etat\.droits\?\.commandes \? gestesLivraisonComptoir : null\)\}/.test(poste))
  v('🔴 le livreur peut annuler sa livraison (« ↩ Annuler la livraison »), via la route du patron',
    /if \(!gestes\?\.retourArriere \|\| !\['livree', 'retiree_magasin'\]\.includes\(l\.statut_livraison\)\) return null/.test(poste)
    && /retourArriere: \(l\) => geste\(`\$\{l\.id\}:retour`[\s\S]{0,900}postPro\('\/api\/commande\/retour-arriere', \{ commande_id: l\.id \}\)/.test(poste))
  v('🔴 « Annulée par le commerce » au Poste : la case « Argent » seulement, avec le mot au client',
    /\.\.\.\(etat\.droits\?\.argent \? \{\s*annulerCommerce:/.test(poste)
    && /postPro\('\/api\/commande\/annuler-commercant', \{ commande_id: c\.id, \.\.\.\(motif \? \{ motif \} : \{\}\) \}\)/.test(poste))
  v('la tournée optimisée est proposée au livreur', /gestesLivraison\.tournee = async \(creneauId\) =>/.test(poste) && /postPro\('\/api\/livraison\/tournee-optimisee'/.test(poste))
  const ka = gl.indexOf('absent: (l) => geste(')
  const ga = ka >= 0 ? gl.slice(ka) : ''
  v('🔴 Poste : « absent » demande confirmation, puis dit si le client est prévenu',
    /if \(choix !== 'oui'\) return\s*const j = await lire\(await postPro\('\/api\/livraison\/livrer', \{ commande_id: l\.id, statut_livraison: 'absent' \}\)\)/.test(ga)
    && /if \(j\.client_prevenu\)/.test(ga) && !/\/api\/livraison\/statut/.test(ga))

  // Le message lui-même, EXÉCUTÉ.
  const { emailLivraisonClientAbsent } = await import('../lib/resend.js')
  const html = emailLivraisonClientAbsent({ yopper_prenom: 'Léa', commercant_nom: '<b>Chez Momo</b>', numero_commande: 'LI7', adresse_livraison: 'Rue 1, Mettet', telephone: '071 12 34 56' })
  v('🔴 le message dit quoi faire : appeler le commerce, avec son numéro', /071 12 34 56/.test(html) && /href="tel:071123456"/.test(html) && /nouvelle livraison/.test(html))
  v('🔴 le nom du commerce est échappé, bouton compris', !html.includes('<b>Chez Momo</b>') && html.includes('&lt;b&gt;Chez Momo&lt;/b&gt;'))
  v('🔴 aucune promesse de remboursement', !/rembours/i.test(html))
  const sansTel = emailLivraisonClientAbsent({ yopper_prenom: 'Léa', commercant_nom: 'Momo', numero_commande: 'LI7' })
  v('sans numéro : un lien vers la commande, pas un « tel: » vide', !/tel:/.test(sansTel) && /Voir ma commande/.test(sansTel))
}

// ═══ AUDIT ÉCRAN CLIENT, 06/10 : LE RÉCAP DE 8 H ET LE TOTAL ═══════════════
// Décisions d'Alex (tableau) : deux blocs « À livrer » / « À retirer » triés
// par heure, la LOCALITÉ seule (jamais la rue), 8 h toute l'année.
{
  const { estHeureDuRecap, lignesRecapCommandes, blocsRecapCommandes } = await import('../lib/recap-commandes.js')
  const { emailRecapCommandesJour } = await import('../lib/resend.js')

  // 8 h à Bruxelles, été (UTC+2) comme hiver (UTC+1).
  v('🔴 été : 6 h UTC = 8 h, on envoie', estHeureDuRecap(new Date('2026-07-01T06:00:00Z')) === true)
  v('🔴 été : 7 h UTC = 9 h, on n’envoie pas deux fois', estHeureDuRecap(new Date('2026-07-01T07:00:00Z')) === false)
  v('🔴 hiver : 6 h UTC = 7 h, plus d’envoi à 7 h', estHeureDuRecap(new Date('2026-12-01T06:00:00Z')) === false)
  v('🔴 hiver : 7 h UTC = 8 h, on envoie', estHeureDuRecap(new Date('2026-12-01T07:00:00Z')) === true)

  const cmds = [
    { id: 3, numero_commande: 3, client_nom: 'Léa Dupont', mode_retrait: 'retrait', creneau: { heure_debut: '10:30:00' }, commande_articles: [{ quantite: 2 }], total: 12 },
    { id: 1, numero_commande: 1, client_nom: 'Marc Petit', mode_retrait: 'livraison', adresse_livraison: 'Rue du Moulin 20, Boîte 2, 5640 Biesme', creneau_livraison: { heure_debut: '11:00:00' }, commande_articles: [{ quantite: 1 }], total: 30 },
    { id: 2, numero_commande: 2, client_nom: 'Zoé Lambert', mode_retrait: 'livraison', adresse_livraison: 'Rue Haute 3, 5640 Mettet', creneau_livraison: { heure_debut: '09:00:00' }, commande_articles: [{ quantite: 4 }], total: 45 },
  ]
  const lignes = lignesRecapCommandes(cmds)
  v('🔴 la livraison porte sa localité', lignes[1].localite === 'Biesme', lignes[1].localite)
  v('🔴 et JAMAIS sa rue : aucune ligne ne garde l’adresse', lignes.every(l => !('adresse_livraison' in l) && !JSON.stringify(l).includes('Moulin')))
  v('un retrait n’a pas de localité', lignes[0].localite === null && lignes[0].mode === 'retrait')
  const blocs = blocsRecapCommandes(lignes)
  v('🔴 deux blocs, « À livrer » d’abord', blocs.map(b => b.titre).join('|') === 'À livrer|À retirer', blocs.map(b => b.titre).join('|'))
  v('🔴 chaque bloc trié par heure, pas par numéro', blocs[0].commandes.map(c => c.heure_debut).join(',') === '09:00:00,11:00:00')
  const html = emailRecapCommandesJour({ nom_commercant: 'Chez Momo', date_jour: '2026-10-07', commandes: lignes, bons_vendus: [] })
  v('🔴 l’email montre les deux blocs', /À livrer · 2/.test(html) && /À retirer · 1/.test(html))
  v('🔴 l’email montre la localité et pas la rue', /Biesme/.test(html) && !/Moulin/.test(html) && !/Rue Haute/.test(html))
  v('sans commande, l’email le dit toujours', /Aucune commande aujourd/.test(emailRecapCommandesJour({ nom_commercant: 'X', date_jour: '2026-10-07', commandes: [] })))

  const cron = code('app/api/cron/recap-jour-8h/route.js')
  v('🔴 le cron s’arrête hors de 8 h à Bruxelles', /if \(!forcer && !estHeureDuRecap\(new Date\(\)\)\) \{/.test(cron))
  v('🔴 le cron lit le mode et passe par les lignes du récap', /mode_retrait, adresse_livraison/.test(cron) && /const cmdsFlat = lignesRecapCommandes\(cmds \|\| \[\]\)/.test(cron))
  v('🔴 « la veille » va de minuit à minuit À BRUXELLES, la veille',
    /\.gte\('created_at', debutVeille\)/.test(cron) && /\.lt\('created_at', debutJour\)/.test(cron)
    && /jourCivilPlus\(dateJour, -1\)/.test(cron))
  const planning = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const recap = (planning.crons || []).find(c => c.path === '/api/cron/recap-jour-8h')
  v('🔴 le cron passe à 6 h ET 7 h UTC', recap?.schedule === '0 6,7 * * *', recap?.schedule)

  // ─── TOUS LES CRONS À LEUR HEURE BELGE, ÉTÉ COMME HIVER (Alex, 06/10) ────
  {
    const { HEURES_CRON, horsDeSonHeure, heuresUtcAttendues } = await import('../lib/heure-cron.js')
    const req = (q = '') => ({ url: `https://www.yoppaa.app/api/cron/x${q}` })
    // Le rappel RDV de 9 h : 7 h UTC en été, 8 h UTC en hiver.
    const ch = '/api/cron/rdv-reminder-9h'
    v('🔴 été : 7 h UTC = 9 h, le rappel part', horsDeSonHeure(req(), ch, new Date('2026-07-01T07:00:00Z')) === false)
    v('🔴 été : 8 h UTC = 10 h, il ne part pas deux fois', horsDeSonHeure(req(), ch, new Date('2026-07-01T08:00:00Z')) === true)
    v('🔴 hiver : 7 h UTC = 8 h, plus de rappel à 8 h', horsDeSonHeure(req(), ch, new Date('2026-12-01T07:00:00Z')) === true)
    v('🔴 hiver : 8 h UTC = 9 h, le rappel part', horsDeSonHeure(req(), ch, new Date('2026-12-01T08:00:00Z')) === false)
    v('un appel manuel peut forcer', horsDeSonHeure(req('?forcer=1'), ch, new Date('2026-12-01T07:00:00Z')) === false)
    v('un cron absent de la table n’est jamais bloqué', horsDeSonHeure(req(), '/api/cron/inconnu', new Date()) === false)

    // 🔴 07/10 : les deux passages du Good Morning répondaient 200 sans un mot,
    // impossible de dire lequel avait envoyé. On EXÉCUTE : un vrai passage (sans
    // instant) écrit sa ligne, une simulation (avec instant) n'écrit rien.
    {
      const lignes = []
      const vraiLog = console.log
      console.log = (...a) => lignes.push(a.join(' '))
      let reponse
      try { reponse = horsDeSonHeure(req(), ch) } finally { console.log = vraiLog }
      v('🔴 un vrai passage écrit au journal s’il travaille ou non',
        lignes.length === 1 && lignes[0].startsWith(`[cron] ${ch} : `)
        && lignes[0].includes(reponse ? 'pas son heure' : 'il travaille'), JSON.stringify(lignes))
    }
    {
      const lignes = []
      const vraiLog = console.log
      console.log = (...a) => lignes.push(a.join(' '))
      try { horsDeSonHeure(req(), ch, new Date('2026-12-01T07:00:00Z')) } finally { console.log = vraiLog }
      v('une simulation du banc n’écrit rien', lignes.length === 0, JSON.stringify(lignes))
    }

    const crons = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).crons || []
    for (const [chemin, cible] of Object.entries(HEURES_CRON)) {
      const planifie = crons.find(c => c.path === chemin)
      const [minute, heures] = (planifie?.schedule || '').split(' ')
      const attendues = heuresUtcAttendues(cible.heure)
      v(`🔴 ${chemin} passe à ${attendues.join(' h et ')} h UTC`,
        !!planifie && attendues.every(h => (heures || '').split(',').map(Number).includes(h)), planifie?.schedule)
      v(`${chemin} à la bonne minute`, Number(minute) === (cible.minute || 0), planifie?.schedule)
      if (chemin === '/api/cron/recap-jour-8h') continue  // sa garde est `estHeureDuRecap`, vérifiée plus haut
      const route = code(`app${chemin}/route.js`)
      v(`🔴 ${chemin} lit SA ligne de la table`,
        new RegExp(`if \\(horsDeSonHeure\\((request|req), '${chemin.replace(/\//g, '\\/')}'\\)\\) return NextResponse\\.json\\(\\{ ok: true, ignore: 'pas_son_heure' \\}\\)`).test(route))
    }
  }

  // ─── L'ÉCRAN CLIENT COMPTE COMME LE SERVEUR (points 10 à 12) ─────────────
  // On EXÉCUTE les deux cas de l'audit avec la fonction que l'écran appelle.
  const { construireLignesCommande } = await import('../lib/lignes-commande.js')
  const { fraisLivraison: regleFrais, minimumAtteint } = await import('../lib/livraison.js')
  const art = { id: 'a1', nom: 'Tarte', prix: 3.3, categorie: 'Pâtisserie', actif: true, commercant_id: 'c1' }
  const base = { articlesData: [art], optionsValeurs: [], variantesData: [], commercant: { tva_taux_defaut: 6 }, regime: undefined }
  const trois = construireLignesCommande({ ...base, panier: [{ id: 'a1', quantite: 3 }], dealsData: [], dateCommande: '2026-10-07' })
  v('🔴 3 × 3,30 € = 990 centimes, pas 9,8999…', trois.ok && trois.totalCents === 990, JSON.stringify(trois.totalCents))
  v('🔴 et la livraison est offerte pile au seuil de 9,90 €', regleFrais({ total: trois.totalCents / 100, frais_fixe: 3, gratuit_des: 9.9 }).montant === 0)
  const dealAujourdhui = { id: 'd1', actif: true, deal_type: 'remise_pct', remise_pct: 20, article_id: 'a1', date_deal: '2026-10-07' }
  const aujourdhui = construireLignesCommande({ ...base, panier: [{ id: 'a1', quantite: 10 }], dealsData: [dealAujourdhui], dateCommande: '2026-10-07' })
  const demain = construireLignesCommande({ ...base, panier: [{ id: 'a1', quantite: 10 }], dealsData: [dealAujourdhui], dateCommande: '2026-10-08' })
  v('🔴 un deal d’aujourd’hui ne vaut pas pour une livraison demain', aujourdhui.totalCents === 2640 && demain.totalCents === 3300, `${aujourdhui.totalCents} / ${demain.totalCents}`)
  v('le minimum se dit avec ce qui manque', minimumAtteint({ total: 18, minimum: 25 }).manque === 7)

  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 l’écran appelle la fonction du serveur, avec TOUS les deals et la date de la commande',
    /const r = construireLignesCommande\(\{[\s\S]{0,400}dealsData: dealsTous,[\s\S]{0,200}dateCommande: dateDeLaCommande\(\),/.test(fiche))
  v('🔴 le total du panier vient de ce calcul, en centimes',
    /function totalPanierCents\(\) \{\s*const r = calculDuServeur\(\)\s*if \(r\) return r\.totalCents/.test(fiche)
    && /function totalPanier\(\) \{ return totalPanierCents\(\) \/ 100 \}/.test(fiche))
  v('🔴 l’envoi part avec la MÊME date et le MÊME panier que l’affichage',
    /const dateStr = dateDeLaCommande\(\)/.test(fiche) && /const articlesPayload = articlesDuPanier\(\)/.test(fiche))
  v('🔴 les frais passent par la règle du serveur', /return regleFraisLivraison\(\{\s*total: totalPanier\(\),/.test(fiche))
  v('🔴 total + frais additionnés en centimes', /function totalAvecFrais\(\) \{ return \(totalPanierCents\(\) \+ Math\.round\(fraisLivraison\(\) \* 100\)\) \/ 100 \}/.test(fiche))
  v('🔴 les lignes du panier affichent le prix du jour de la commande',
    (fiche.match(/prixLigne\(item, i\)|prixDeLigne=\{prixLigne\}/g) || []).length === 2)
  v('🔴 le minimum est dit avant le paiement', /La livraison démarre à \{euros\(minimumLivraison\(\)\.seuil\)\}/.test(fiche))
  v('🔴 et il bloque le bouton de paiement', /const livraisonFormOk = !!\([^\n]*&& minimumLivraison\(\)\.ok\)/.test(fiche))
  v('🔴 tous les deals voyagent dans le cache et l’état', /dealsTous: dealsData \|\| \[\],/.test(fiche) && /setDealsTous\(data\.dealsTous \|\| data\.dealsActifs \|\| \[\]\)/.test(fiche))
  v('🔴 l’écran se redessine chaque minute (tournée passée)', /setInterval\(\(\) => setMinuteEcran\(m => m \+ 1\), 60000\)/.test(fiche))
  v('🔴 `modeBoutiqueEff` déclaré AVANT le minimum qui le lit', fiche.indexOf('const modeBoutiqueEff =') > 0 && fiche.indexOf('const modeBoutiqueEff =') < fiche.indexOf('const livraisonFormOk ='))

  // Le total d'une commande s'additionne en CENTIMES : 10,1 + 2,2 en euros vaut 12,299999999999999.
  const cc = code('app/api/stripe/checkout/create-commande/route.js')
  v('🔴 le total enregistré est additionné en centimes', /total: \(totalCents \+ fraisLivraisonCents\) \/ 100,/.test(cc))
}

console.log(`\nLivrer une commande : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
