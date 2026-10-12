// HARNAIS DE MUTATION — LA FILE DES ÉTIQUETTES ET LA TABLETTE DU COMPTOIR (11/10)
//
// Chaque mutation casse UNE garantie ; `verif:file-etiquettes` doit rougir.
// Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-file-etiquettes.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:file-etiquettes'
const REGLE = 'lib/file-etiquettes.js'
const FILE = 'app/api/impression/file/route.js'
const RESULTAT = 'app/api/impression/resultat/route.js'
const DEMANDER = 'app/api/impression/demander/route.js'
const STATUT = 'app/api/equipe/commande/statut/route.js'
const SQL = 'migrations/MIGRATION_FILE_ETIQUETTES.sql'

const MUTATIONS = [
  // ─── les règles ─────────────────────────────────────────────────────────
  { nom: '🔴 une étiquette déposée sans station (personne ne la videra)', fichier: REGLE,
    de: "  return !!stationExiste && deStatut === 'en_attente'", vers: "  return deStatut === 'en_attente'" },
  { nom: '🔴 une étiquette déposée à chaque pas (« prête » comprise)', fichier: REGLE,
    de: "deStatut === 'en_attente' && versStatut === 'en_preparation' && etiquetteConcernee(commande)", vers: 'etiquetteConcernee(commande)' },
  { nom: '🔴 l expédition reçoit une étiquette', fichier: REGLE,
    de: "versStatut === 'en_preparation' && etiquetteConcernee(commande)", vers: "versStatut === 'en_preparation'" },
  { nom: '⚠️ une station muette depuis une heure reste « en ligne »', fichier: REGLE,
    de: '  return maintenant.getTime() - t < STATION_EN_LIGNE_MS', vers: '  return true' },
  { nom: '⚠️ les sacs ne sont plus bornés', fichier: REGLE,
    de: '  return Number.isFinite(n) ? Math.min(SACS_MAX, Math.max(1, n)) : 1', vers: '  return Number.isFinite(n) ? n : 1' },
  { nom: '🔴 une commande disparue s imprime quand même (vide)', fichier: REGLE,
    de: '  if (!commande) return null', vers: '' },
  { nom: '⚠️ n importe quelle raison est écrite en base', fichier: REGLE,
    de: "  return Object.prototype.hasOwnProperty.call(RAISONS_ECHEC, raison) ? raison : 'autre'", vers: "  return raison || 'autre'" },
  // ─── les routes ─────────────────────────────────────────────────────────
  { nom: '🔴 une autre tablette vide la file', fichier: FILE,
    de: '    if (!station || station.appareil_id !== appareil_id) {', vers: '    if (!station) {' },
  { nom: '🔴 la même étiquette peut être prise deux fois', fichier: FILE,
    de: ".in('id', candidates.map(c => c.id)).eq('commercant_id', commercant_id).eq('statut', 'en_attente')", vers: ".in('id', candidates.map(c => c.id)).eq('commercant_id', commercant_id)" },
  { nom: '🔴 une étiquette coincée ne revient jamais', fichier: FILE,
    de: ".eq('commercant_id', commercant_id).eq('statut', 'en_cours').lt('pris_le', limite)", vers: ".eq('commercant_id', commercant_id).eq('statut', 'jamais')" },
  { nom: '🔴 la file imprime les commandes d un autre commerce', fichier: FILE,
    de: "      .in('id', ids).eq('commercant_id', commercant_id)", vers: "      .in('id', ids)" },
  { nom: '🔴 une autre tablette réécrit le résultat', fichier: RESULTAT,
    de: ".eq('appareil_id', appareil_id).eq('statut', 'en_cours')", vers: ".eq('statut', 'en_cours')" },
  { nom: '🔴 la réimpression vise la commande d un autre commerce', fichier: DEMANDER,
    de: "        .eq('id', commande_id).eq('commercant_id', commercant_id).maybeSingle()", vers: "        .eq('id', commande_id).maybeSingle()" },
  { nom: '🔴 sans station, la demande attend en silence', fichier: DEMANDER,
    de: '    if (!station) return NextResponse.json(', vers: '    if (false) return NextResponse.json(' },
  { nom: '🔴 n importe qui (sans le droit « commandes ») vide la file', fichier: FILE,
    de: "    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')", vers: "    const garde = { ok: true, commercant: {}, user: {} }" },
  // ─── le dépôt et le navigateur ──────────────────────────────────────────
  { nom: '🔴 le dépôt ignore la règle (sans station)', fichier: STATUT,
    de: '  if (!etiquetteADeposer({ commande, deStatut, versStatut, stationExiste: !!station })) return', vers: '  if (!etiquetteADeposer({ commande, deStatut, versStatut, stationExiste: true })) return' },
  { nom: '🔴 le tableau de bord imprime AUSSI par le navigateur (deux étiquettes)', fichier: 'app/dashboard/page.js',
    de: "      if (aImprimer?.statut === 'en_attente' && !comptoir.aStation) imprimerSiActive(", vers: "      if (aImprimer?.statut === 'en_attente') imprimerSiActive(" },
  { nom: '🔴 le Poste imprime AUSSI par le navigateur', fichier: 'app/equipe/PosteEquipe.js',
    de: "      if (vers === 'en_preparation' && !comptoir.aStation) imprimerSiActive(", vers: "      if (vers === 'en_preparation') imprimerSiActive(" },
  // ─── l'étiquette en image (12/10) ───────────────────────────────────────
  { nom: '🔴 l image n a plus la largeur de la Brother (mise à l échelle, floue)', fichier: 'lib/etiquette-image.js',
    de: '  largeurPx: 696,', vers: '  largeurPx: 720,' },
  { nom: '🔴 plus de marges : le texte touche le bord du rouleau', fichier: 'lib/etiquette-image.js',
    de: '  const g = mm(IMAGE_ETIQUETTE.margeCoteMm)', vers: '  const g = 0' },
  { nom: '🔴 un nom long n est plus coupé en lignes (il sort de l étiquette)', fichier: 'lib/etiquette-image.js',
    de: '    const lignes = couperTexte(t, utile - retrait, mesurer, police(s), lignesMax ?? s.lignesMax ?? Infinity)', vers: '    const lignes = [String(t)]' },
  { nom: '🔴 « À payer » perd son fond noir', fichier: 'lib/etiquette-image.js',
    de: "        elements.push({ type: 'rect', x: d - larg,", vers: "        void ({ type: 'rect', x: d - larg," },
  { nom: '⚠️ le logo perd ses cinq points', fichier: 'lib/etiquette-image.js',
    de: "    elements.push({ type: 'point', x: xp + r, y: yPoints + p.decalage + r, r })", vers: '    void r' },
  { nom: '⚠️ le nom du commerce passe sous le logo', fichier: 'lib/etiquette-image.js',
    de: '    const place = xLogo - g - mm(2)', vers: '    const place = utile' },
  { nom: '⚠️ la dernière ligne gaspille la place avant « … »', fichier: 'lib/etiquette-image.js',
    de: "  let derniere = lignes.slice(lignesMax - 1).join(' ')", vers: '  let derniere = gardees[lignesMax - 1]' },
  // ─── la migration ───────────────────────────────────────────────────────
  { nom: '🔴 les navigateurs lisent la file', fichier: SQL,
    de: 'REVOKE ALL ON public.etiquettes_impression FROM PUBLIC, anon, authenticated;', vers: 'GRANT SELECT ON public.etiquettes_impression TO authenticated;' },
  { nom: '🔴 la file n a plus de RLS', fichier: SQL,
    de: 'ALTER TABLE public.etiquettes_impression ENABLE ROW LEVEL SECURITY;', vers: '' },
  { nom: '⚠️ les sacs ne sont plus bornés en base', fichier: SQL,
    de: 'CHECK (sacs BETWEEN 1 AND 20)', vers: 'CHECK (sacs > 0)' },
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
