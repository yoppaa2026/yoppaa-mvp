// HARNAIS DE MUTATION — LA COMMANDE ENCODÉE À LA MAIN (10/10)
//
// Chaque mutation casse UNE garde de la commande encodée ; `verif:encodee`
// doit rougir. Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-commande-encodee.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:encodee'
const REGLE = 'lib/commande-encodee.js'
const ROUTE = 'app/api/equipe/commande/creer/route.js'
const LECTURE = 'app/api/equipe/commande/catalogue/route.js'
const FENETRE = 'app/dashboard/ModalNouvelleCommande.js'
const BORD = 'app/dashboard/page.js'
const SQL = 'migrations/MIGRATION_COMMANDE_ENCODEE.sql'

const MUTATIONS = [
  // ─── LA RÈGLE ────────────────────────────────────────────────────────────
  { nom: '🔴 « payé » passe en paiement en ligne : la compta compte une carte qui n existe pas',
    fichier: REGLE, de: '  const base = { paye_en_ligne: false }', vers: '  const base = { paye_en_ligne: paiement !== \'a_payer\' }' },
  { nom: '🔴 « à payer au retrait » écrit quand même un encaissement',
    fichier: REGLE, de: "  if (paiement === 'a_payer') return { ok: true, champs: { ...base, encaisse_mode: null, encaisse_montant: null, encaisse_le: null } }", vers: "  if (paiement === 'a_payer') return { ok: true, champs: { ...base, encaisse_mode: 'especes', encaisse_montant: Number(total), encaisse_le: maintenant.toISOString() } }" },
  { nom: '🔴 la confirmation donnée vaut pour TOUT avertissement, même nouveau',
    fichier: REGLE, de: '  return (avertissements || []).some(a => !vus.has(a.code))', vers: '  return (avertissements || []).length > 0 && vus.size === 0' },
  { nom: '🔴 une date passée s encode',
    fichier: REGLE, de: "  if (dateCommande < aujourdhui) return { refus: 'Cette date est passée.' }", vers: '' },
  { nom: '⚠️ un créneau commencé est refusé au lieu d être signalé',
    fichier: REGLE, de: "  if (verdict.raison === 'passe') return { refus: null, avertissement: avertissement('creneau_commence') }", vers: "  if (verdict.raison === 'passe') return { refus: 'Créneau passé.' }" },
  { nom: '🔴 un créneau terminé s encode (le serveur ne le refuse plus)',
    fichier: REGLE, de: "  if (termine) return { refus: 'Ce créneau est terminé. Choisis-en un autre.' }", vers: '' },
  { nom: '🔴 le créneau EN COURS est caché (fin confondue avec début)',
    fichier: REGLE, de: '  const fin = instant(dateStr, creneau.heure_fin)', vers: '  const fin = instant(dateStr, creneau.heure_debut)' },
  { nom: '⚠️ le créneau qui passe minuit est caché dès le soir',
    fichier: REGLE, de: '    ? new Date(fin.getTime() + 24 * 3600 * 1000) : fin', vers: '    ? fin : fin' },
  { nom: '🔴 la route ne dit plus si le créneau est terminé',
    fichier: ROUTE, de: '      termine: creneauTermine(creneau, { dateStr: date_commande, instant: brusselsInstant }),', vers: '' },
  { nom: '🔴 la fenêtre montre à nouveau les créneaux de 7 h à 15 h',
    fichier: FENETRE, de: "  }).filter(({ creneau }) => !creneauTermine(creneau, { dateStr: date, maintenant: new Date(minute), instant: brusselsInstant })),", vers: '  }),' },
  { nom: '🔴 la bande de remplissage montre à nouveau les créneaux de 7 h',
    fichier: BORD, de: "  })).filter(({ creneau }) => !creneauTermine(creneau, { dateStr: jourActif, maintenant: new Date(minuteBande), instant: brusselsInstant }))", vers: '  }))' },
  { nom: '⚠️ la bande ne relit plus l heure : un créneau fini reste jusqu au rechargement',
    fichier: BORD, de: '    const t = setInterval(() => setMinuteBande(Date.now()), 60000)', vers: '    const t = null' },
  { nom: '⚠️ un créneau choisi qui se termine reste choisi',
    fichier: FENETRE, de: '    if (creneauId && !creneaux.some(({ creneau }) => creneau.id === creneauId)) setCreneauId(null)', vers: '' },
  { nom: '🔴 le nom n est plus obligatoire',
    fichier: REGLE, de: "  if (n.length < 2) return { ok: false, error: 'Indique au moins le nom du client.' }", vers: '' },
  { nom: '🔴 la saisie du commerçant fait sonner son propre écran',
    fichier: REGLE, de: '  return (commandes || []).filter(c => c && c.origine !== ORIGINE_COMMERCANT && c.statut !== \'paiement_en_attente\').length', vers: '  return (commandes || []).filter(c => c && c.statut !== \'paiement_en_attente\').length' },
  { nom: '⚠️ deux articles courts partagent un seul code : confirmer l un confirme l autre',
    fichier: REGLE, de: "  const famille = String(code).split(':')[0]", vers: "  const famille = String(code).split(':')[0]; code = famille" },

  // ─── LA ROUTE ────────────────────────────────────────────────────────────
  { nom: '🔴 n importe quel membre encode, même sans la case',
    fichier: ROUTE, de: "    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')", vers: "    const garde = await gardeEquipe(request, admin, commercant_id, ['commandes', 'agenda', 'livraisons', 'comptoir'])" },
  { nom: '🔴 le créneau plein passe sans prévenir',
    fichier: ROUTE, de: "      })) avertissements.push(avertissement('creneau_plein'))", vers: '      })) void 0' },
  { nom: '🔴 un stock court passe sans prévenir',
    fichier: ROUTE, de: "      avertissements.push(avertissement(`stock:${verifStock.article_id || 'circuit'}`, verifStock.error))", vers: '      void 0' },
  { nom: '🔴 une panne de lecture du stock passe pour un simple avertissement',
    fichier: ROUTE, de: '      if (verifStock.status >= 500) return non(verifStock.error, verifStock.status)', vers: '' },
  { nom: '🔴 on écrit sans attendre la confirmation',
    fichier: ROUTE, de: '    if (confirmationRequise(avertissements, corps.confirmes)) {', vers: '    if (false) {' },
  { nom: '🔴 la commande encodée n est plus marquée comme telle : le verrou la refuse et l écran sonne',
    fichier: ROUTE, de: '        origine: ORIGINE_COMMERCANT,', vers: '' },
  { nom: '🔴 le commerçant reçoit l e-mail « Nouvelle commande » de sa propre saisie',
    fichier: ROUTE, de: '    await envoyerEmailsCommande(commande.id, admin, { versClient: confirmation, versCommercant: false })', vers: '    await envoyerEmailsCommande(commande.id, admin)' },
  { nom: '🔴 la confirmation part même sans que le commerçant l ait demandée',
    fichier: ROUTE, de: '    const confirmation = !!corps.envoyer_confirmation && !!client.client_email', vers: '    const confirmation = !!client.client_email' },
  { nom: '🔴 une version en rupture refuse la commande au lieu de prévenir',
    fichier: ROUTE, de: '      stockVarianteIndicatif: true,', vers: '      stockVarianteIndicatif: false,' },
  { nom: '⚠️ des lignes ratées laissent une commande fantôme',
    fichier: ROUTE, de: "      await admin.from('commandes').delete().eq('id', commande.id)", vers: '      void 0' },

  // ─── LA LECTURE ──────────────────────────────────────────────────────────
  { nom: '🔴 la lecture des commandes du jour laisse sortir le nom des clients',
    fichier: LECTURE, de: "        .select('statut, date_commande, creneau_id, creneau_livraison_id, commande_articles(quantite, article:articles(temps_prepa))')", vers: "        .select('statut, client_nom, date_commande, creneau_id, creneau_livraison_id, commande_articles(quantite, article:articles(temps_prepa))')" },

  // ─── LES ÉCRANS ──────────────────────────────────────────────────────────
  { nom: '🔴 un créneau sans limite s affiche « Plein »',
    fichier: FENETRE, de: '                const complet = !!capacite && completBrut', vers: '                const complet = completBrut' },
  { nom: '⚠️ un avertissement périmé reste affiché après un changement',
    fichier: FENETRE, de: '  useEffect(() => { setAvertissements(null) }, [mode, date, creneauId, panier, adresse, paiement])', vers: '' },
  { nom: '🔴 le tableau de bord recompte toutes les commandes pour sonner',
    fichier: BORD, de: '      const arrivees = nombreArriveesEnLigne(triees)', vers: '      const arrivees = triees.length' },

  // ─── LA MIGRATION ────────────────────────────────────────────────────────
  { nom: '🔴 l exemption passe avant le filtre des statuts',
    fichier: SQL, de: "  IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN", vers: "  IF NEW.origine = 'commercant' THEN RETURN NEW; END IF; IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN" },
  { nom: '🔴 le verrou change en douce pour les commandes en ligne',
    fichier: SQL, de: '    IF v_nb + 1 > v_max THEN', vers: '    IF v_nb > v_max THEN' },
  { nom: '🔴 l origine n est plus fermée',
    fichier: SQL, de: "  ADD CONSTRAINT commandes_origine_check CHECK (origine IN ('en_ligne', 'commercant'));", vers: "  ADD CONSTRAINT commandes_origine_check CHECK (origine IS NOT NULL);" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
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
  const f = chemin(m.fichier)
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
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
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
