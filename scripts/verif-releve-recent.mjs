// BANC — LE RELEVÉ DU TABLEAU DE BORD NE RELIT PLUS QUE LE RÉCENT (09/11)
//
// Alerte Supabase « Disk IO Budget » sur la production (08/11). Décisions
// d'Alex (tableau, 09/11) :
//   - toutes les 5 s, seulement les commandes récentes ou en cours et l'agenda
//     à partir d'avant-hier, posés sur la liste affichée ; son et alerte
//     immédiats ;
//   - l'historique complet au retour sur l'écran et toutes les 5 min ;
//   - la fiche publique n'écoute plus `commande_articles` (sans filtre possible).
//
// ⚠️ LE BANC EXÉCUTE LES RÈGLES (lib/releve-recent.js) ET LIT LE CODE QUI LES
// APPELLE (app/dashboard/page.js, fiche publique), sans sa prose.
//
//   npm run verif:releve

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  debutReleveRecent, filtreCommandesRecentes, fusionnerParId, rdvSupprime, trierRdvs,
  RELEVE_RECENT_MS, RELECTURE_COMPLETE_MS, STATUTS_EN_COURS,
} from '../lib/releve-recent.js'

const RACINE = new URL('../', import.meta.url)
const lire = (f) => readFileSync(new URL(f, RACINE), 'utf8')
const code = (f) => sansProse(lire(f))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. LES RÈGLES, EXÉCUTÉES ════════════════════════════════════════════════
{
  v('🔴 la fenêtre commence AVANT-HIER, heure belge',
    debutReleveRecent(new Date('2026-11-09T10:00:00Z')) === '2026-11-07',
    String(debutReleveRecent(new Date('2026-11-09T10:00:00Z'))))
  // 23 h 30 en temps universel = 0 h 30 le 09/11 à Bruxelles.
  v('🔴 à 0 h 30 heure belge, c’est déjà le jour belge qui compte (pas le temps universel)',
    debutReleveRecent(new Date('2026-11-08T23:30:00Z')) === '2026-11-07',
    String(debutReleveRecent(new Date('2026-11-08T23:30:00Z'))))
  v('une date illisible ne donne pas de fenêtre', debutReleveRecent(new Date('pas une date')) === null)

  v('🔴 le filtre : créées récemment, OU à retirer dès la fenêtre, OU encore en cours',
    filtreCommandesRecentes('2026-11-07') === 'created_at.gte.2026-11-07,date_commande.gte.2026-11-07,statut.in.(en_attente,en_preparation,pret)',
    filtreCommandesRecentes('2026-11-07'))
  v('les statuts « en cours » sont les trois EXACTS du CHECK',
    JSON.stringify(STATUTS_EN_COURS) === JSON.stringify(['en_attente', 'en_preparation', 'pret']))

  const affichees = [{ id: 'a', s: 1 }, { id: 'b', s: 1 }, { id: 'c', s: 1 }]
  const copie = JSON.stringify(affichees)
  const relues = [{ id: 'b', s: 2 }, { id: 'd', s: 1 }, { id: null, s: 9 }]
  const f = fusionnerParId(affichees, relues)
  const parId = Object.fromEntries(f.map(l => [l.id, l.s]))
  v('🔴 fusion : une ligne relue REMPLACE la sienne, une inconnue S’AJOUTE, les autres RESTENT',
    f.length === 4 && parId.a === 1 && parId.b === 2 && parId.c === 1 && parId.d === 1, JSON.stringify(f))
  v('fusion : la liste affichée n’est jamais modifiée', JSON.stringify(affichees) === copie && f !== affichees)
  const g = fusionnerParId(affichees, [{ id: 'c', deleted_at: '2026-11-09' }, { id: 'e', deleted_at: '2026-11-09' }], { retirer: rdvSupprime })
  v('🔴 fusion : un rendez-vous supprimé relu SORT de l’agenda (et un supprimé inconnu n’y entre pas)',
    g.length === 2 && !g.some(l => l.id === 'c' || l.id === 'e'), JSON.stringify(g))
  v('fusion : sans liste, rien ne casse', fusionnerParId(null, null).length === 0 && fusionnerParId(undefined, [{ id: 'x' }]).length === 1)
  v('rdvSupprime : seulement avec une date de suppression', rdvSupprime({ deleted_at: 'x' }) && !rdvSupprime({ deleted_at: null }) && !rdvSupprime(null))

  const t = trierRdvs([
    { id: '2', date_rdv: '2026-11-10', heure_debut: '09:00' },
    { id: '1', date_rdv: '2026-11-10', heure_debut: '09:00' },
    { id: '3', date_rdv: '2026-11-09', heure_debut: '15:00' },
    { id: '4', date_rdv: '2026-11-10', heure_debut: '08:00' },
  ])
  v('🔴 l’agenda fusionné garde l’ordre de la lecture : date, heure, puis identifiant',
    t.map(r => r.id).join('') === '3412', t.map(r => r.id).join(''))

  v('🔴 les rythmes : 5 s pour le récent, 5 min pour tout l’historique',
    RELEVE_RECENT_MS === 5000 && RELECTURE_COMPLETE_MS === 300000)
}

// ═══ 2. LE TABLEAU DE BORD, LU ═══════════════════════════════════════════════
{
  const d = code('app/dashboard/page.js')
  const recentes = (d.match(/function lireCommandesRecentes\(commercantId\) \{[\s\S]*?\n\}/) || [''])[0]
  v('🔴 lecture récente des commandes : même select que la lecture complète, sans « paiement en attente », filtrée sur la fenêtre',
    /\.select\(SELECT_COMMANDES\)/.test(recentes) && /\.eq\('commercant_id', commercantId\)/.test(recentes)
    && /\.neq\('statut', 'paiement_en_attente'\)/.test(recentes) && /\.or\(filtreCommandesRecentes\(depuis\)\)/.test(recentes)
    && /toutesLesLignes\(/.test(recentes))
  const rdvs = (d.match(/function lireRdvsRecents\(commercantId\) \{[\s\S]*?\n\}/) || [''])[0]
  v('🔴 lecture récente de l’agenda : à partir de la fenêtre, et SANS filtre deleted_at (sinon un supprimé ne sortirait jamais)',
    /\.select\(SELECT_RDVS\)/.test(rdvs) && /\.gte\('date_rdv', depuis\)/.test(rdvs) && !/deleted_at/.test(rdvs) && /toutesLesLignes\(/.test(rdvs))

  v('🔴 le relevé des 5 s ne relit PLUS tout l’historique des commandes',
    !/lireCommandes\(commercant\.id, \{ sansPaiementEnAttente: true \}\)/.test(d))
  v('🔴 le relevé pose le récent sur la liste affichée, sans « paiement en attente »',
    /const \{ data: recentes, error \} = await lireCommandesRecentes\(commercant\.id\)/.test(d)
    && /fusionnerParId\(commandesRef\.current, recentes\)\.filter\(c => c\.statut !== 'paiement_en_attente'\)/.test(d))
  v('🔴 rien avant l’historique complet de CE commerce (fausse alerte sinon)',
    /const historiquePret = commandesChargeesPourRef\.current === commercant\.id\s*if \(historiquePret\) \{/.test(d)
    && /const agendaPret = rdvsChargesPourRef\.current === commercant\.id/.test(d)
    && /agendaPret \? await lireRdvsRecents\(commercant\.id\) : \{ data: null \}/.test(d))
  v('🔴 l’agenda relu se pose sur l’agenda affiché, les supprimés en sortent, dans l’ordre',
    /trierRdvs\(fusionnerParId\(rdvsRef\.current, rdvsRecents, \{ retirer: rdvSupprime \}\)\)/.test(d))
  v('🔴 la lecture complète marque l’historique comme lu (commandes, et agenda SEULEMENT s’il a été lu)',
    /commandesRef\.current = triees\s*commandesChargeesPourRef\.current = id/.test(d)
    && /if \(rdvData\) \{ rdvsRef\.current = rdvData; rdvsChargesPourRef\.current = id \}/.test(d))
  v('🔴 les miroirs suivent l’état, gestes compris',
    /useEffect\(\(\) => \{ commandesRef\.current = commandes \}, \[commandes\]\)/.test(d)
    && /useEffect\(\(\) => \{ rdvsRef\.current = rdvs \}, \[rdvs\]\)/.test(d))
  v('🔴 l’historique complet toutes les 5 min (plus 60 s), et toujours au retour sur l’écran',
    /const interval = setInterval\(refresh, RELECTURE_COMPLETE_MS\)/.test(d) && !/setInterval\(refresh, 60000\)/.test(d)
    && /document\.addEventListener\('visibilitychange', onVisChange\)/.test(d))
  v('le relevé tourne au rythme du récent', /\}, RELEVE_RECENT_MS\)/.test(d))
  v('le son d’une nouvelle commande compte toujours sur la liste COMPLÈTE fusionnée',
    /const triees = trierCommandes\(data\)\s*const arrivees = nombreArriveesEnLigne\(triees\)/.test(d))
}

// ═══ 3. LA FICHE PUBLIQUE, LUE ═══════════════════════════════════════════════
{
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 la fiche n’écoute plus `commande_articles` (aucun filtre possible : toutes les commandes de Yoppaa)',
    !/table: 'commande_articles'/.test(fiche))
  v('la fiche écoute toujours les commandes DE CE COMMERCE',
    /table: 'commandes', filter: `commercant_id=eq\.\$\{commercant\.id\}` \}, \(\) => chargerCommandesJour\(\)\)/.test(fiche))
}

console.log(`Relevé récent : ${ok + echecs.length} vérifications`)
if (echecs.length) {
  console.log(`\n🔴 ${echecs.length} ÉCHEC(S) :`)
  echecs.forEach(e => console.log('   • ' + e))
  process.exit(1)
}
console.log('Tout passe.')
