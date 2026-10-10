// BANC — LA COMMANDE ENCODÉE À LA MAIN (Alex, 10/10, « version express »)
//
// Ce qui est décidé et que ce banc tient :
//   - même créneau, même stock, même prix que la commande en ligne ;
//   - créneau plein, stock court, délai dépassé, hors zone : on PRÉVIENT,
//     puis on laisse encoder d'un second geste ;
//   - patron + équipe avec la case « Commandes » ;
//   - nom obligatoire, téléphone et e-mail facultatifs ;
//   - `paye_en_ligne` toujours faux, aucun frais Stripe ;
//   - l'e-mail au client est une confirmation, à la demande ; jamais l'e-mail
//     « Nouvelle commande » au commerçant, ni la sonnerie de son écran.
//
// ⚠️ ON EXÉCUTE LA RÈGLE, ET ON VISE L'ENDROIT DANS LE CODE (jamais un mot).
//
//   npm run verif:encodee

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  ORIGINE_COMMERCANT, PAIEMENTS_ENCODEE, clientEncode, champsPaiementEncodee,
  avertissement, confirmationRequise, jugementMoment, nombreArriveesEnLigne, creneauTermine,
} from '../lib/commande-encodee.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))
// « a AVANT b » exige que les DEUX existent : -1 est « avant » tout.
const avant = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); return i >= 0 && j >= 0 && i < j }
const MAINTENANT = new Date('2026-10-10T09:30:00Z')

// ═══ 1) LA RÈGLE, EXÉCUTÉE ══════════════════════════════════════════════════
{
  const c1 = clientEncode({ nom: '  Mario   Rossi ', telephone: '0471 23 45 67', email: ' Mario@Exemple.BE ' })
  v('🔴 le nom seul suffit, les espaces sont nettoyés',
    clientEncode({ nom: 'Lu' }).ok && c1.ok && c1.client.client_nom === 'Mario Rossi')
  v('l’e-mail est mis en minuscules, le téléphone gardé tel quel',
    c1.client.client_email === 'mario@exemple.be' && c1.client.client_telephone === '0471 23 45 67')
  v('sans téléphone ni e-mail : null, jamais une chaîne vide',
    clientEncode({ nom: 'Lucie' }).client.client_telephone === null && clientEncode({ nom: 'Lucie' }).client.client_email === null)
  v('🔴 pas de nom : refus', !clientEncode({ nom: ' ' }).ok && !clientEncode({}).ok)
  v('un e-mail faux ou un téléphone tronqué : refus lisible',
    !clientEncode({ nom: 'Lucie', email: 'lucie@' }).ok && !clientEncode({ nom: 'Lucie', telephone: '0471' }).ok)

  const p0 = champsPaiementEncodee({ paiement: 'a_payer', total: 12.5, maintenant: MAINTENANT })
  const p1 = champsPaiementEncodee({ paiement: 'especes', total: 12.499, maintenant: MAINTENANT })
  const p2 = champsPaiementEncodee({ paiement: 'terminal', total: 30, maintenant: MAINTENANT })
  v('🔴 paye_en_ligne reste FAUX dans les trois cas (Stripe n’a rien vu)',
    [p0, p1, p2].every(p => p.ok && p.champs.paye_en_ligne === false))
  v('🔴 « à payer au retrait » n’écrit aucun encaissement',
    p0.champs.encaisse_mode === null && p0.champs.encaisse_montant === null && p0.champs.encaisse_le === null)
  v('🔴 « payé » écrit le mode, le montant arrondi et l’heure',
    p1.champs.encaisse_mode === 'especes' && p1.champs.encaisse_montant === 12.5 && p1.champs.encaisse_le === MAINTENANT.toISOString()
    && p2.champs.encaisse_mode === 'terminal')
  v('🔴 aucun mode que la base refuserait (pas de virement)',
    PAIEMENTS_ENCODEE.filter(p => p !== 'a_payer').every(p => ['terminal', 'especes'].includes(p)))
  v('un paiement non dit : refus', !champsPaiementEncodee({ paiement: null, total: 10 }).ok && !champsPaiementEncodee({ paiement: 'virement', total: 10 }).ok)

  const plein = avertissement('creneau_plein')
  const stockA = avertissement('stock:a1', 'Plus que 2.')
  v('un avertissement dit le fait en une phrase', plein.code === 'creneau_plein' && /plein/.test(plein.message))
  v('🔴 un avertissement d’article garde son code, et le texte de sa famille',
    stockA.code === 'stock:a1' && stockA.message === 'Le stock ne suffit pas. Plus que 2.')
  v('🔴 pas d’avertissement : on écrit sans demander', !confirmationRequise([], []))
  v('🔴 un avertissement non confirmé : on demande', confirmationRequise([plein], []))
  v('🔴 confirmé : on écrit', !confirmationRequise([plein, stockA], ['creneau_plein', 'stock:a1']))
  v('🔴 un NOUVEL avertissement apparu entre les deux clics redemande',
    confirmationRequise([plein, avertissement('stock:b2')], ['creneau_plein', 'stock:a1']))
  v('confirmer un article ne confirme pas l’autre', confirmationRequise([avertissement('stock:b2')], ['stock:a1']))

  const auj = '2026-10-10'
  v('🔴 une date passée est refusée', !!jugementMoment({ verdict: { ok: true }, dateCommande: '2026-10-09', aujourdhui: auj }).refus)
  v('🔴 un créneau d’un autre jour de semaine est refusé',
    !!jugementMoment({ verdict: { ok: false, raison: 'jour' }, dateCommande: auj, aujourdhui: auj }).refus)
  v('🔴 créneau commencé ou délai dépassé : avertissement, pas refus',
    jugementMoment({ verdict: { ok: false, raison: 'passe' }, dateCommande: auj, aujourdhui: auj }).avertissement?.code === 'creneau_commence'
    && jugementMoment({ verdict: { ok: false, raison: 'cutoff' }, dateCommande: auj, aujourdhui: auj }).avertissement?.code === 'delai_depasse'
    && !jugementMoment({ verdict: { ok: false, raison: 'cutoff' }, dateCommande: auj, aujourdhui: auj }).refus)
  v('🔴 un créneau TERMINÉ est refusé, même commencé',
    !!jugementMoment({ verdict: { ok: false, raison: 'passe' }, dateCommande: auj, aujourdhui: auj, termine: true }).refus)

  // Heure murale de Bruxelles en été : UTC+2 (11 h 30 à Bruxelles = 09:30Z).
  const instant = (d, h) => new Date(`${d}T${h.length === 5 ? `${h}:00` : h}+02:00`)
  const t = (debut, fin) => creneauTermine({ heure_debut: debut, heure_fin: fin }, { dateStr: auj, maintenant: MAINTENANT, instant })
  v('🔴 terminé à 11 h 30 : le créneau de 7 h, et celui qui finit pile à 11 h 30',
    t('07:00:00', '07:15:00') && t('11:15:00', '11:30:00'))
  v('🔴 le créneau EN COURS reste, l’avenir aussi', !t('11:15:00', '11:45:00') && !t('12:00:00', '12:15:00'))
  v('un créneau qui passe minuit finit le lendemain', !t('22:00:00', '00:30:00'))
  v('demain, rien n’est terminé',
    !creneauTermine({ heure_debut: '07:00:00', heure_fin: '07:15:00' }, { dateStr: '2026-10-11', maintenant: MAINTENANT, instant }))
  v('sans heure de fin ou sans horloge : rien n’est caché',
    !creneauTermine({ heure_debut: '07:00:00' }, { dateStr: auj, maintenant: MAINTENANT, instant }) && !creneauTermine({ heure_fin: '07:15:00' }, { dateStr: auj }))

  const liste = [
    { statut: 'en_attente', origine: 'en_ligne' },
    { statut: 'en_attente', origine: ORIGINE_COMMERCANT },
    { statut: 'paiement_en_attente', origine: 'en_ligne' },
    { statut: 'pret' },
  ]
  v('🔴 la sonnerie ne compte ni la saisie du commerçant ni le paiement en cours', nombreArriveesEnLigne(liste) === 2)
}

// ═══ 2) LA ROUTE D'ÉCRITURE ═════════════════════════════════════════════════
{
  const r = code('app/api/equipe/commande/creer/route.js')
  v('🔴 garde de l’équipe avec la case « Commandes », avant toute lecture',
    /const garde = await gardeEquipe\(request, admin, commercant_id, 'commandes'\)/.test(r)
    && avant(r, "gardeEquipe(request, admin, commercant_id, 'commandes')", ".from('commercants')"))
  v('alimentaire seulement', /if \(commercant\.categorie !== 'alimentaire'\) return non\(/.test(r))
  v('🔴 le prix vient de la règle de toutes les commandes, versions en avertissement',
    /construireLignesCommande\(\{[\s\S]{0,300}stockVarianteIndicatif: true,/.test(r))
  v('🔴 la capacité : le même compte partagé et la même règle',
    /occupationDuCreneau\(\{/.test(r) && /commandeDeborde\(creneau, \{/.test(r) && /avertissements\.push\(avertissement\('creneau_plein'\)\)/.test(r))
  v('🔴 le stock : la même vérification, un refus devient un avertissement (une panne reste une erreur)',
    /const verifStock = await verifierStockDisponible\(\{/.test(r)
    && /if \(verifStock\.status >= 500\) return non\(/.test(r)
    && /avertissements\.push\(avertissement\(`stock:\$\{verifStock\.article_id \|\| 'circuit'\}`, verifStock\.error\)\)/.test(r))
  v('🔴 on prévient AVANT d’écrire', avant(r, 'confirmationRequise(avertissements, corps.confirmes)', ".from('commandes')\n      .insert("))
  v('🔴 la commande naît encodée, confirmée, sans Stripe',
    /origine: ORIGINE_COMMERCANT,/.test(r) && /statut: 'en_attente',/.test(r) && /\.\.\.paiement\.champs,/.test(r)
    && !/paye_en_ligne: true/.test(r) && !/stripe/i.test(r.replace(/stripe-mode/g, '')))
  v('🔴 aucune réservation de cinq minutes : elle consomme par ses lignes', !/reserver_stock_atomique/.test(r))
  v('🔴 les lignes ratées défont la commande', /if \(errLignes\) \{\s*await admin\.from\('commandes'\)\.delete\(\)\.eq\('id', commande\.id\)/.test(r))
  v('🔴 jamais l’e-mail « Nouvelle commande » au commerçant ; la confirmation au client à la demande',
    /envoyerEmailsCommande\(commande\.id, admin, \{ versClient: confirmation, versCommercant: false \}\)/.test(r)
    && /const confirmation = !!corps\.envoyer_confirmation && !!client\.client_email/.test(r))
  v('aucun consentement marketing présumé', /rgpd_marketing: false,/.test(r))
  v('la livraison hors du référentiel se note quand même, avec avertissement',
    /avertissements\.push\(avertissement\('adresse_non_situee'\)\)/.test(r) && /avertissements\.push\(avertissement\('hors_zone'\)\)/.test(r))
  v('le geste d’un membre est journalisé', /journaliserGeste\(admin, garde, \{\s*action: 'commande_encodee'/.test(r))
  v('🔴 un créneau terminé est refusé par le serveur, à l’heure de Bruxelles, avant toute écriture',
    /termine: creneauTermine\(creneau, \{ dateStr: date_commande, instant: brusselsInstant \}\),/.test(r)
    && avant(r, 'termine: creneauTermine(', 'if (moment.refus) return non(moment.refus)'))
}

// ═══ 3) LA LECTURE POUR LA FENÊTRE ══════════════════════════════════════════
{
  const r = code('app/api/equipe/commande/catalogue/route.js')
  v('🔴 même garde que l’écriture', /gardeEquipe\(request, admin, commercant_id, 'commandes'\)/.test(r))
  v('🔴 rien de personnel sur les commandes du jour',
    /select\('statut, date_commande, creneau_id, creneau_livraison_id, commande_articles\(quantite, article:articles\(temps_prepa\)\)'\)/.test(r)
    && !/client_nom|client_email|client_telephone/.test(r))
  v('ni prix indicatif ni versions', /filter\(a => !a\.est_vitrine && !a\.gere_variantes\)/.test(r))
}

// ═══ 4) LES ÉCRANS ══════════════════════════════════════════════════════════
{
  const m = code('app/dashboard/ModalNouvelleCommande.js')
  v('🔴 la fenêtre lit et écrit par le serveur, pour le patron comme l’équipe',
    /postPro\('\/api\/equipe\/commande\/catalogue'/.test(m) && /postPro\('\/api\/equipe\/commande\/creer'/.test(m) && !/from '@\/lib\/supabase'/.test(m))
  v('🔴 le total et le remplissage viennent des règles du serveur',
    /construireLignesCommande\(\{/.test(m) && /remplissageCreneaux\(\{/.test(m))
  v('🔴 un créneau sans limite n’est jamais « plein »', /const complet = !!capacite && completBrut/.test(m))
  v('🔴 un avertissement s’efface dès qu’on change ce qu’il a vu',
    /useEffect\(\(\) => \{ setAvertissements\(null\) \}, \[mode, date, creneauId, panier, adresse, paiement\]\)/.test(m))
  v('🔴 « encoder quand même » renvoie les codes montrés', /encoder\(avertissements \? avertissements\.map\(a => a\.code\) : \[\]\)/.test(m))
  v('le bouton montre qu’il travaille', /\{envoi && <DotsAttente/.test(m))
  v('🔴 la fenêtre cache les créneaux terminés, relus chaque minute, et lâche un choix terminé',
    /\}\)\.filter\(\(\{ creneau \}\) => !creneauTermine\(creneau, \{ dateStr: date, maintenant: new Date\(minute\), instant: brusselsInstant \}\)\)/.test(m)
    && /setInterval\(\(\) => setMinute\(Date\.now\(\)\), 60000\)/.test(m)
    && /if \(creneauId && !creneaux\.some\(\(\{ creneau \}\) => creneau\.id === creneauId\)\) setCreneauId\(null\)/.test(m))

  const bord = code('app/dashboard/page.js')
  v('🔴 la sonnerie ne compte que les arrivées en ligne (trois endroits)',
    (bord.match(/nombreArriveesEnLigne\(triees\)/g) || []).length === 2 && /dernierNombreRef\.current = arrivees/.test(bord)
    && !/triees\.length > dernierNombreRef\.current/.test(bord))
  v('le bouton n’apparaît qu’en alimentaire avec des créneaux',
    /commercant\?\.categorie === 'alimentaire' && \(creneauxRetrait\.length > 0 \|\| creneauxLivraison\.length > 0\)/.test(bord))
  v('la carte dit qu’une commande est encodée', /commande\.origine === ORIGINE_COMMERCANT/.test(bord))

  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 l’équipe encode seulement avec la case « Commandes »',
    /etat\.droits\?\.commandes && etat\.commerce\?\.categorie === 'alimentaire'/.test(poste) && /<ModalNouvelleCommande/.test(poste))
}

// ═══ 5) LA MIGRATION ════════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_COMMANDE_ENCODEE.sql').split('-- ─── CONTRÔLE')[0]
  const fn = (sql.split('CREATE OR REPLACE FUNCTION public.commandes_capacite_creneau()')[1] || '').split('END $$;')[0]
  v('🔴 l’origine, en ligne par défaut, fermée à deux valeurs',
    /ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'en_ligne'/.test(sql) && /CHECK \(origine IN \('en_ligne', 'commercant'\)\)/.test(sql))
  v('🔴 l’exemption passe APRÈS le filtre des statuts et AVANT le verrou',
    avant(fn, "IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN", "IF NEW.origine = 'commercant' THEN")
    && avant(fn, "IF NEW.origine = 'commercant' THEN", 'pg_advisory_xact_lock('))
  // ⚠️ LE RESTE DE LA RÈGLE EST INCHANGÉ : on compare au texte d'I8, exemption retirée.
  const i8 = lire('migrations/MIGRATION_I7_I8_TOURNEE_FERMEE_CAPACITE.sql')
  const fnI8 = (i8.split('CREATE OR REPLACE FUNCTION public.commandes_capacite_creneau()')[1] || '').split('END $$;')[0]
  const normal = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
  const sansExemption = fn.replace(/IF NEW\.origine = 'commercant' THEN\s*RETURN NEW;\s*END IF;/, '')
  v('🔴 hors exemption, le verrou est mot pour mot celui d’I8', fnI8.length > 500 && normal(sansExemption) === normal(fnI8))
  v('les colonnes lues sont vérifiées avant tout', avant(sql, "RAISE EXCEPTION 'Colonnes absentes", 'ADD COLUMN IF NOT EXISTS origine'))
  v('téléphone et e-mail facultatifs',
    /ALTER COLUMN client_email DROP NOT NULL/.test(sql) && /ALTER COLUMN client_telephone DROP NOT NULL/.test(sql))
}

console.log(`\nLa commande encodée : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
