// Harnais de mutation : LES TABLES JOINTES (lot 3 du module restaurant,
// 11/09/2026).
//
// La demande du Bistrologue : « j'autorise le couplage de x fois 2 tables de
// 4 personnes ». Chaque mutation remet un défaut plausible ; le banc désigné
// doit rougir.
// ⚠️ Aucune ancre ne contient de saut de ligne. Restauration par CONTENU,
// vérifiée. Jamais `git checkout`. Une mutation change le RÉSULTAT, jamais la
// TERMINAISON : un banc qui plante n'a rien mesuré.
import { ecrireSur } from './harnais-mutation.mjs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const MODULE = 'lib/inventaire-salle.js'

const MUTATIONS = [
  // ─── LE MOTEUR : QUAND JOINDRE ──────────────────────────────────────────
  { nom: '🔴 les jointures passent avant les tables seules', banc: 'verif:jointes',
    de: '  return [...seules, ...jointes]',
    vers: '  return [...jointes, ...seules]' },
  { nom: '🔴 une jointure invalide se propose', banc: 'verif:jointes',
    de: '  const jointes = jointuresValides(formats).filter(accueille)',
    vers: '  const jointes = (formats || []).filter(f => estJointure(f)).filter(accueille)' },
  { nom: '🔴 on joint sans inventaire', banc: 'verif:jointes',
    de: '  if (!enModeInventaire(formats)) return []',
    vers: '  void enModeInventaire' },
  { nom: '🔴 on joint deux tables qu’on n’a pas', banc: 'verif:jointes',
    de: '    return q !== null && q >= k',
    vers: '    return q !== null' },
  { nom: '🔴 une table éteinte se joint quand même', banc: 'verif:jointes',
    de: '    if (!base || base.par_couverts !== true || base.actif === false || estJointure(base)) return false',
    vers: '    if (!base || base.par_couverts !== true || estJointure(base)) return false' },
  { nom: '🔴 une jointure éteinte se propose', banc: 'verif:jointes',
    de: '    if (!j || j.par_couverts !== true || j.actif === false || !estJointure(j)) return false',
    vers: '    if (!j || j.par_couverts !== true || !estJointure(j)) return false' },
  { nom: '🔴 une jointure compte comme une table de plus', banc: 'verif:jointes',
    de: '  return (formats || []).filter(f => f && f.par_couverts === true && f.actif !== false && !estJointure(f))',
    vers: '  return (formats || []).filter(f => f && f.par_couverts === true && f.actif !== false)' },

  // ─── LE MOTEUR : CE QU'UNE JOINTURE IMMOBILISE ──────────────────────────
  { nom: '🔴 une jointure n’immobilise plus ses tables', banc: 'verif:jointes',
    de: '    if (j) pris.set(j.base, (pris.get(j.base) || 0) + j.k)',
    vers: '    void j' },
  { nom: '🔴 le nombre autorisé à la fois est ignoré', banc: 'verif:jointes',
    de: '  return Math.max(0, Math.min(x - (pris.get(String(jointure.id)) || 0), Math.floor(tablesLibres / k)))',
    vers: '  return Math.max(0, Math.floor(tablesLibres / k))' },
  { nom: '🔴 on joint des tables qui ne sont pas libres', banc: 'verif:jointes',
    de: '  return Math.max(0, Math.min(x - (pris.get(String(jointure.id)) || 0), Math.floor(tablesLibres / k)))',
    vers: '  return Math.max(0, x - (pris.get(String(jointure.id)) || 0))' },
  { nom: '🔴 une jointure libre se dit prise', banc: 'verif:jointes',
    de: "      if (jointuresLibres(f, formats, pris) > 0) return { format: f, raison: 'ok' }",
    vers: "      if (false) return { format: f, raison: 'ok' }" },
  { nom: '⚠️ plus de jointures au mieux que de paires de tables', banc: 'verif:jointes',
    de: '  return Math.min(x, Math.floor(q / k))',
    vers: '  return x' },

  // ─── LE MOTEUR : CE QUE L'ÉCRAN EN DIT ──────────────────────────────────
  { nom: '🔴 le sélecteur s’arrête à la plus grande table', banc: 'verif:jointes',
    de: '  return jointuresValides(formats).reduce((m, j) => Math.max(m, tailleDe(j) || 0), plusGrandeTable(formats))',
    vers: '  return plusGrandeTable(formats)' },
  { nom: '⚠️ une taille sans table se propose', banc: 'verif:jointes',
    de: '    if (formatsPourGroupe(formats, n).length > 0) out.push(n)',
    vers: '    out.push(n)' },
  { nom: '⚠️ la phrase redit « la plus grande table » à qui joint', banc: 'verif:jointes',
    de: '      ? (joint ? `Même en joignant des tables, ta salle accueille ${max} personnes au plus.` : `La plus grande en accueille ${max}.`)',
    vers: '      ? `La plus grande en accueille ${max}.`' },

  // ─── LE MOTEUR : LE RÉGLAGE ─────────────────────────────────────────────
  { nom: '⚠️ par défaut, toutes les jointures possibles à la fois', banc: 'verif:jointes',
    de: '    quantite: 1,',
    vers: '    quantite: Math.floor((quantiteDe(base) || 2) / k),' },
  { nom: '🔴 on autorise plus de jointures que de paires de tables', banc: 'verif:jointes',
    de: '  if (!Number.isFinite(x) || x < 1 || x > possible) {',
    vers: '  if (!Number.isFinite(x) || x < 1) {' },
  { nom: '🔴 une table éteinte ne se dit plus sur la carte', banc: 'verif:jointes',
    de: '  if (base.actif === false) return',
    vers: '  if (false) return' },
  { nom: '⚠️ trop de jointures autorisées ne se dit plus', banc: 'verif:jointes',
    de: '  if (x !== null && x > possible) return',
    vers: '  if (false) return' },

  // ─── LE SERVEUR ─────────────────────────────────────────────────────────
  { nom: '🔴 le serveur ne lit plus la composition des formats', banc: 'verif:jointes', fichier: 'lib/rdv-creation-server.js',
    de: ", quantite, actif, jointure_de, jointure_tables'",
    vers: ", quantite, actif'" },
  { nom: '🔴 une jointure passe dans une salle comptée en couverts', banc: 'verif:jointes', fichier: 'lib/rdv-creation-server.js',
    de: '    if (estJointure(prestation) && !enModeInventaire(formatsTable)) {',
    vers: '    if (false) {' },
  { nom: '🔴 « trop grand » retombe dans le 500 « réessaie »', banc: 'verif:jointes', fichier: 'app/api/rdv/reserver/route.js',
    de: "      if (res.code === 'groupe_trop_grand') {",
    vers: '      if (false) {' },
  { nom: '⚠️ « complet » ne renvoie plus choisir une autre heure', banc: 'verif:jointes', fichier: 'app/api/rdv/reserver/route.js',
    de: '          creneau_refuse: true,',
    vers: '' },

  // ─── LA FICHE DU CLIENT ─────────────────────────────────────────────────
  { nom: '🔴 le sélecteur repart de 1 à la plus grande, trous compris', banc: 'verif:jointes', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '{taillesReservables(prestations).map(n => (',
    vers: '{Array.from({ length: plusGrandGroupe(prestations) }, (_, i) => i + 1).map(n => (' },
  { nom: '🔴 une jointure se choisit dans une carte', banc: 'verif:jointes', fichier: 'app/commander/rdv/[slug]/page.js',
    de: 'const prestationsAuChoix = (prestations || []).filter(p => !estJointure(p))',
    vers: 'const prestationsAuChoix = (prestations || []).filter(p => !!p)' },

  // ─── LE TABLEAU DE BORD ─────────────────────────────────────────────────
  { nom: '🔴 le tableau de bord ne lit plus la composition', banc: 'verif:jointes', fichier: 'app/dashboard/page.js',
    de: ", quantite, jointure_de, jointure_tables')",
    vers: ", quantite')" },
  { nom: '🔴 la saisie propose une jointure dans son menu', banc: 'verif:jointes', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: 'const auMenu = (prestations || []).filter(p => !estJointure(p))',
    vers: 'const auMenu = (prestations || [])' },
  { nom: '⚠️ la saisie s’arrête à la plus grande table', banc: 'verif:jointes', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: 'max={plusGrandGroupe(prestations) || undefined}',
    vers: 'max={undefined}' },
  { nom: '⚠️ la jointure s’affiche sous un couple', banc: 'verif:jointes', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: 'etat.parFormat.filter(l => !l.jointure || l.convient).map(',
    vers: 'etat.parFormat.map(' },
  { nom: '🔴 les jointures comptent parmi les tables', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: 'const prestationsSeules = prestations.filter(p => !estJointure(p))',
    vers: 'const prestationsSeules = prestations' },
  { nom: '🔴 la composition ne part pas à la création', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        ? { ...payload, jointure_de: form.jointure_de, jointure_tables: Number(form.jointure_tables) }',
    vers: '        ? payload' },
  { nom: '🔴 la règle du module ne passe plus avant la base', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      if (refus) return toast(refus, 'error')",
    vers: '      void refus' },
  { nom: '🔴 la copie ratée des services se tait', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        if (errC) copieRatee = true',
    vers: '        void errC' },
  { nom: '🔴 une jointure réservée s’éteint sans prévenir', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    if (p.actif && await refusJointureReservee(p)) return',
    vers: '    void refusJointureReservee' },
  { nom: '🔴 une table jointe se supprime sous sa jointure', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    const jointes = estJointure(p) ? [] : jointuresDe(p, prestations)',
    vers: '    const jointes = []' },
  { nom: '⚠️ le refus de la base arrive en message brut', banc: 'verif:jointes', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    if (m.includes('JOINTURE_RESERVEE')) return",
    vers: '    if (false) return' },

  // ─── LA BASE ────────────────────────────────────────────────────────────
  { nom: '🔴 la composition n’est plus figée', banc: 'verif:jointes', fichier: 'migrations/MIGRATION_TABLES_JOINTES.sql',
    de: "    RAISE EXCEPTION 'JOINTURE_FIGEE'",
    vers: "    RAISE NOTICE 'JOINTURE_FIGEE'" },
  { nom: '🔴 on joint la table d’une autre maison', banc: 'verif:jointes', fichier: 'migrations/MIGRATION_TABLES_JOINTES.sql',
    de: '       OR base_commerce IS DISTINCT FROM NEW.commercant_id',
    vers: '       OR false' },
  { nom: '🔴 une jointure réservée se supprime', banc: 'verif:jointes', fichier: 'migrations/MIGRATION_TABLES_JOINTES.sql',
    de: '          OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN',
    vers: '          OR FALSE) THEN' },
  { nom: '⚠️ la garde ne veille plus à la modification', banc: 'verif:jointes', fichier: 'migrations/MIGRATION_TABLES_JOINTES.sql',
    de: '  BEFORE INSERT OR UPDATE ON public.rdv_prestations',
    vers: '  BEFORE INSERT ON public.rdv_prestations' },
]

const lancer = (banc) => {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-600) }
  }
}

// Filtre facultatif : `node scripts/mutations-tables-jointes.mjs verif:jointes`
const seul = process.argv[2] || null
const LISTE = seul ? MUTATIONS.filter(m => m.banc === seul) : MUTATIONS
const BANCS = [...new Set(LISTE.map(m => m.banc))]

for (const b of BANCS) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DEJA ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au depart : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []

for (const m of LISTE) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ! ${m.nom} — texte introuvable`)
    continue
  }
  ecrireSur(f, original.split(m.de).join(m.vers))
  const r = lancer(m.banc)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log('RESTAURATION RATEE, on arrete tout.')
    process.exit(2)
  }
  if (r.rouge && !r.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else {
    manquees.push(m.nom + (r.plante ? ' (le banc a PLANTÉ, il n a rien mesuré)' : ''))
    console.log(`  ✕ NON attrapée : ${m.nom}${r.plante ? ' (PLANTAGE)' : ''}`)
  }
}

console.log(`\n${attrapees}/${LISTE.length} mutations attrapées.`)
for (const b of BANCS) {
  if (lancer(b).rouge) { console.log(`🔴 ${b} ROUGE APRES RESTAURATION.`); process.exit(2) }
}
console.log('Bancs verts après restauration. Dépôt intact.')
if (manquees.length) { console.log('\nMANQUÉES :'); manquees.forEach(m => console.log('  - ' + m)); process.exit(1) }
