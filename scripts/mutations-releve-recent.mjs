// HARNAIS DE MUTATION — LE RELEVÉ RÉCENT DU TABLEAU DE BORD (09/11, Disk IO)
//
// Chaque mutation casse UNE garantie ; `verif:releve` doit rougir.
// Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-releve-recent.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:releve'
const REGLE = 'lib/releve-recent.js'
const BORD = 'app/dashboard/page.js'
const FICHE = 'app/commander/[slug]/page.js'

const MUTATIONS = [
  // ─── les règles ─────────────────────────────────────────────────────────
  { nom: '🔴 la fenêtre commence hier (commandes de minuit à 1 h perdues)', fichier: REGLE,
    de: '  return aujourdhui ? ajouterJoursISO(aujourdhui, -2) : null', vers: '  return aujourdhui ? ajouterJoursISO(aujourdhui, -1) : null' },
  { nom: '🔴 une précommande pour demain, passée il y a dix jours, n est plus relue', fichier: REGLE,
    de: '`created_at.gte.${depuis},date_commande.gte.${depuis},statut.in.', vers: '`created_at.gte.${depuis},statut.in.' },
  { nom: '🔴 une vieille commande encore « prête » n est plus relue', fichier: REGLE,
    de: "export const STATUTS_EN_COURS = ['en_attente', 'en_preparation', 'pret']", vers: "export const STATUTS_EN_COURS = ['en_attente', 'en_preparation']" },
  { nom: '🔴 la fusion garde l ancienne ligne au lieu de la relue', fichier: REGLE,
    de: '    else parId.set(l.id, l)', vers: '    else if (!parId.has(l.id)) parId.set(l.id, l)' },
  { nom: '🔴 un rendez-vous supprimé reste à l agenda', fichier: REGLE,
    de: '    if (retirer(l)) parId.delete(l.id)', vers: '    if (false) parId.delete(l.id)' },
  { nom: '⚠️ l agenda fusionné perd son ordre par heure', fichier: REGLE,
    de: "    || t(a.heure_debut).localeCompare(t(b.heure_debut))", vers: '' },
  { nom: '🔴 l historique complet relu toutes les 60 s', fichier: REGLE,
    de: 'export const RELECTURE_COMPLETE_MS = 5 * 60 * 1000', vers: 'export const RELECTURE_COMPLETE_MS = 60 * 1000' },
  // ─── le tableau de bord ─────────────────────────────────────────────────
  { nom: '🔴 le relevé relit de nouveau tout l historique', fichier: BORD,
    de: '      const { data: recentes, error } = await lireCommandesRecentes(commercant.id, signal)', vers: '      const { data: recentes, error } = await lireCommandes(commercant.id, { sansPaiementEnAttente: true })' },
  { nom: '🔴 la lecture récente oublie la fenêtre', fichier: BORD,
    de: '    .or(filtreCommandesRecentes(depuis))', vers: '' },
  { nom: '🔴 « paiement en attente » sonne trop tôt (filtre final retiré)', fichier: BORD,
    de: ": fusionnerParId(commandesRef.current, recentes).filter(c => c.statut !== 'paiement_en_attente')", vers: ': fusionnerParId(commandesRef.current, recentes)' },
  { nom: '🔴 le relevé remplace la liste par le seul récent', fichier: BORD,
    de: ": fusionnerParId(commandesRef.current, recentes).filter(", vers: ': fusionnerParId([], recentes).filter(' },
  { nom: '🔴 fausse alerte : relevé avant l historique complet', fichier: BORD,
    de: '      const historiquePret = commandesChargeesPourRef.current === commercant.id', vers: '      const historiquePret = true' },
  { nom: '🔴 fausse alerte : agenda relu avant l agenda complet', fichier: BORD,
    de: '      const agendaPret = rdvsChargesPourRef.current === commercant.id', vers: '      const agendaPret = true' },
  { nom: '🔴 un supprimé relu reste à l agenda (retirer oublié)', fichier: BORD,
    de: '{ retirer: rdvSupprime }', vers: '{}' },
  { nom: '🔴 la lecture récente de l agenda filtre les supprimés (ils ne sortent jamais)', fichier: BORD,
    de: "    .gte('date_rdv', depuis)", vers: "    .gte('date_rdv', depuis).is('deleted_at', null)" },
  { nom: '🔴 l agenda en erreur est marqué comme lu', fichier: BORD,
    de: '    if (rdvData) { rdvsRef.current = rdvData; rdvsChargesPourRef.current = id }', vers: '    rdvsRef.current = rdvData || []; rdvsChargesPourRef.current = id' },
  { nom: '🔴 un geste sur une vieille commande est écrasé (miroir figé)', fichier: BORD,
    de: '  useEffect(() => { commandesRef.current = commandes }, [commandes])', vers: '' },
  { nom: '🔴 l historique complet ne se relit plus au retour sur l écran', fichier: BORD,
    de: "    document.addEventListener('visibilitychange', onVisChange)", vers: '' },
  { nom: '🔴 la relecture complète revient à 60 s', fichier: BORD,
    de: '    const interval = setInterval(refresh, RELECTURE_COMPLETE_MS)', vers: '    const interval = setInterval(refresh, 60000)' },
  // ─── la fiche publique ──────────────────────────────────────────────────
  { nom: '🔴 la fiche écoute de nouveau toutes les commandes de Yoppaa', fichier: FICHE,
    de: "      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'articles',", vers: "      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => chargerCommandesJour()).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'articles'," },
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
