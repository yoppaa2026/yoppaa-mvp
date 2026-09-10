// Harnais de mutation : LA CADENCE DE LA CUISINE (lot 5, 12/09/2026).
//
// Chaque mutation remet un défaut plausible ; le banc désigné doit rougir.
// ⚠️ Aucune ancre ne contient de saut de ligne, et chacune est UNIQUE dans son
// fichier (le moteur refuse sinon). Restauration par CONTENU, vérifiée. Jamais
// `git checkout`. Une mutation change le RÉSULTAT, jamais la TERMINAISON : un
// banc qui plante n'a rien mesuré.
import { ecrireSur } from './harnais-mutation.mjs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const MODULE = 'lib/inventaire-salle.js'
const BANC = 'verif:cadence'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 on compte les présences au lieu des arrivées',
    de: '    if (d === null || !Number.isFinite(d) || quartDe(d) !== q) return s',
    vers: '    if (d === null || !Number.isFinite(d) || d > debutMin) return s' },
  { nom: '🔴 une réservation annulée arrive quand même',
    de: '    if (r.statut && !STATUTS_QUI_OCCUPENT.includes(r.statut)) return s',
    vers: '' },
  { nom: '⚠️ la réservation déplacée se compte elle-même',
    de: '    if (exclureId != null && String(r.id) === String(exclureId)) return s',
    vers: '' },
  { nom: '🔴 une heure illisible arrive à minuit',
    de: "    const d = typeof r.start === 'number' ? r.start : minutesDeLHeure(r.heure_debut)",
    vers: "    const d = typeof r.start === 'number' ? r.start : timeToMinutes(r.heure_debut)" },
  { nom: '🔴 on compte des tables au lieu des personnes',
    de: '    return s + couvertsDe(r)',
    vers: '    return s + 1' },
  { nom: '🔴 pile la cadence est refusée',
    de: '    depasse: arrivees > 0 && arrivees + n > p,',
    vers: '    depasse: arrivees > 0 && arrivees + n >= p,' },
  { nom: '✅ un grand groupe seul sur son quart d’heure est refusé',
    de: '    depasse: arrivees > 0 && arrivees + n > p,',
    vers: '    depasse: arrivees + n > p,' },
  { nom: '🔴 une cadence de zéro ferme la fiche',
    de: '  return Number.isInteger(n) && n >= CADENCE_MIN && n <= CADENCE_MAX ? n : null',
    vers: '  return Number.isInteger(n) ? n : null' },
  { nom: '🔴 le réglage accepte zéro',
    de: '  if (!Number.isInteger(n) || n < CADENCE_MIN || n > CADENCE_MAX) {',
    vers: '  if (!Number.isFinite(n) || n > CADENCE_MAX) {' },
  { nom: '🔴 le quart d’heure s’arrondit au plus proche',
    de: '  return Number.isFinite(m) ? Math.floor(m / QUART_MINUTES) * QUART_MINUTES : null',
    vers: '  return Number.isFinite(m) ? Math.round(m / QUART_MINUTES) * QUART_MINUTES : null' },
  { nom: '⚠️ une heure absente devient minuit',
    de: "  if (minutes === null || minutes === undefined || minutes === '') return null",
    vers: '' },
  { nom: '⚠️ l’alarme sonne même quand la cuisine suit',
    de: '  if (!etat?.depasse) return null',
    vers: '  if (!etat) return null' },
  { nom: '⚠️ « 1 personnes arrivent »',
    de: "${a > 1 ? 's arrivent' : ' arrive'}",
    vers: 's arrivent' },
  { nom: '🔴 la salle du tableau de bord se lit sans ses couverts',
    de: ".select('id, prestation_id, heure_debut, heure_fin, statut, couverts')",
    vers: ".select('id, prestation_id, heure_debut, heure_fin, statut')" },
  { nom: '🔴 la cadence n’arrive pas au tableau de bord',
    de: '    plafond: plafondCadence(reglage?.data),',
    vers: '    plafond: null,' },
  { nom: '⚠️ une cadence illisible passe pour « pas de limite »',
    de: '    error: resas?.error || reglage?.error || null,',
    vers: '    error: resas?.error || null,' },
  { nom: '⚠️ la phrase du client sans nom',
    de: "  const qui = String(nom || '').trim() || 'Le restaurant'",
    vers: "  const qui = String(nom || '').trim()" },

  // ─── LE MOTEUR DE CRÉNEAUX ──────────────────────────────────────────────
  { nom: '🔴 la grille ne transmet pas la cadence', fichier: 'lib/rdv-slots.js',
    de: '        cadence,',
    vers: '        cadence: null,' },
  { nom: '🔴 un quart d’heure plein ne se lit pas « complet »', fichier: 'lib/rdv-slots.js',
    de: " || c.raison === 'cadence' ? 'complet'",
    vers: " ? 'complet'" },
  { nom: '🔴 la règle ignore la cadence', fichier: 'lib/rdv-slots.js',
    de: "  return etat?.depasse ? { ...verdict, conflit: true, raison: 'cadence', cadence: etat } : verdict",
    vers: '  return verdict' },
  { nom: '🔴 la cadence s’applique à un salon', fichier: 'lib/rdv-slots.js',
    de: '  if (verdict.conflit || !cadence || regle.parCouverts !== true) return verdict',
    vers: '  if (verdict.conflit || !cadence) return verdict' },
  { nom: '⚠️ la cuisine parle avant la salle', fichier: 'lib/rdv-slots.js',
    de: '  if (verdict.conflit || !cadence || regle.parCouverts !== true) return verdict',
    vers: '  if (!cadence || regle.parCouverts !== true) return verdict' },

  // ─── LE SERVEUR ─────────────────────────────────────────────────────────
  { nom: '🔴 le serveur ne tient pas compte de la cadence', fichier: 'lib/rdv-creation-server.js',
    de: '        if (cadence?.depasse) {',
    vers: '        if (false) {' },
  { nom: '🔴 le serveur ne compte que les tables de la salle', fichier: 'lib/rdv-creation-server.js',
    de: "          .select('id, heure_debut, couverts')",
    vers: "          .select('id, heure_debut, couverts').in('prestation_id', (formatsTable || []).map(f => f.id))" },
  { nom: '🔴 le serveur compte les annulées', fichier: 'lib/rdv-creation-server.js',
    de: "          .in('statut', STATUTS_OCCUPENT)",
    vers: '' },
  { nom: '⚠️ le restaurateur est bloqué par le serveur', fichier: 'lib/rdv-creation-server.js',
    de: "    const cuisineAConsulter = champs?.source !== 'commercant'",
    vers: '    const cuisineAConsulter = true' },
  { nom: '🔴 une lecture en échec ferme la salle', fichier: 'lib/rdv-creation-server.js',
    de: '      const plafond = errReglage ? null : plafondCadence(reglage)',
    vers: '      const plafond = errReglage ? 1 : plafondCadence(reglage)' },
  { nom: '⚠️ une lecture en échec ne se dit nulle part', fichier: 'lib/rdv-creation-server.js',
    de: "      if (errReglage) console.error('[rdv/creation] cadence illisible, non appliquée', errReglage.message)",
    vers: '' },
  { nom: '🔴 la cadence se lit avec le lieu, pour toutes les réservations', fichier: 'lib/rdv-creation-server.js',
    de: "const COLONNES_LIEU = 'id, nom, adresse, latitude, longitude, siege_social_est_lieu_activite'",
    vers: "const COLONNES_LIEU = 'id, nom, adresse, latitude, longitude, siege_social_est_lieu_activite, rdv_cadence_couverts'" },
  { nom: '⚠️ le refus ne dit plus ce qui reste', fichier: 'lib/rdv-creation-server.js',
    de: "          return { ok: false, code: 'cadence_atteinte', restants: cadence.restants, plafond: cadence.plafond }",
    vers: "          return { ok: false, code: 'cadence_atteinte' }" },

  // ─── LA ROUTE ───────────────────────────────────────────────────────────
  { nom: '🔴 la route laisse la cadence tomber dans le 500', fichier: 'app/api/rdv/reserver/route.js',
    de: "      if (res.code === 'cadence_atteinte') {",
    vers: "      if (res.code === 'cadence') {" },
  { nom: '⚠️ la route écrit sa propre phrase', fichier: 'app/api/rdv/reserver/route.js',
    de: '          error: phraseCuisinePleine({ heure, nom: commercant.nom }),',
    vers: "          error: 'C’est complet.'," },

  // ─── LA FICHE ───────────────────────────────────────────────────────────
  { nom: '🔴 la fiche ne passe pas la cadence au moteur', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '    cadence: estParCouverts(prestationChoisie) && plafondCuisine !== null',
    vers: '    cadence: false && plafondCuisine !== null' },
  { nom: '🔴 le contrôle d’avant envoi dit « plus de table »', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "        setSubmitError(conflit.raison === 'cadence'",
    vers: "        setSubmitError(conflit.raison === 'cadence_'" },
  { nom: '⚠️ la fiche lit la cadence sans la règle', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '  const plafondCuisine = plafondCadence(commercant)',
    vers: '  const plafondCuisine = commercant?.rdv_cadence_couverts ?? null' },

  // ─── LA SAISIE AU TÉLÉPHONE ─────────────────────────────────────────────
  { nom: '🔴 hors inventaire, la salle ne se lit pas', banc: 'verif:table', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '  const lectureSalle = enTable || tableHorsInventaire',
    vers: '  const lectureSalle = enTable' },
  { nom: '🔴 la cadence parle sur une heure passée', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '  const cadence = !passe && salleConnue && heureValide && groupeCadence',
    vers: '  const cadence = salleConnue && heureValide && groupeCadence' },
  { nom: '🔴 le bouton dit « Confirmer » sur une cuisine pleine', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: "(choixTable?.forcer || cadenceDepassee) ? 'Poser quand même ✓'",
    vers: "(choixTable?.forcer) ? 'Poser quand même ✓'" },
  { nom: '🔴 une heure où la cuisine est pleine se propose (inventaire)', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          if (cuisinePleine(m, nCouverts)) return false',
    vers: '' },
  { nom: '🔴 une heure où la cuisine est pleine se propose (sans inventaire)', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          if (cuisinePleine(timeToMinutes(h), groupe)) return false',
    vers: '' },
  { nom: '🔴 un quart d’heure rempli pendant l’appel s’écrit sans un mot', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '        const cadenceChangee = (cadenceFrais?.depasse === true) !== cadenceDepassee',
    vers: '        const cadenceChangee = false' },
  { nom: '⚠️ l’alerte de la cuisine ne s’affiche pas', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          {messageCadence && (',
    vers: '          {false && (' },
  { nom: '⚠️ hors inventaire, une salle illisible se tait', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: "          {tableHorsInventaire && salle.etat === 'erreur' && (",
    vers: '          {false && (' },

  // ─── LE DÉPLACEMENT ─────────────────────────────────────────────────────
  { nom: '🔴 au déplacement, la salle ne se lit qu’en inventaire', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    if (!estTable || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return',
    vers: '    if (!salleEnTables || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return' },
  { nom: '🔴 la réservation déplacée se gêne elle-même', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '? etatCadence({ plafond: salle.plafond, couverts: couvertsRdv, reservations: salle.reservations, debutMin: minutesDeLHeure(heure), exclureId: rdv?.id })',
    vers: '? etatCadence({ plafond: salle.plafond, couverts: couvertsRdv, reservations: salle.reservations, debutMin: minutesDeLHeure(heure) })' },
  { nom: '🔴 le bouton dit « Déplacer le RDV » sur une cuisine pleine', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: "    && ((salleEnTables && !!choixTable && (choixTable.forcer || choixTable.raison === 'trop_grand')) || cadenceDepassee)",
    vers: "    && ((salleEnTables && !!choixTable && (choixTable.forcer || choixTable.raison === 'trop_grand')))" },
  { nom: '🔴 « Créneaux libres » propose un quart d’heure plein', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '        if (estTable && etatCadence({ plafond: salle.plafond, couverts: couvertsRdv, reservations: salle.reservations, debutMin: minutesDeLHeure(h), exclureId: rdv?.id })?.depasse) return false',
    vers: '' },
  { nom: '🔴 un quart d’heure rempli pendant la saisie se déplace sans un mot', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '          && (cadenceFrais?.depasse === true) === cadenceDepassee',
    vers: '' },
  { nom: '⚠️ l’alerte de la cuisine ne s’affiche pas au déplacement', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '          {messageCadence && (',
    vers: '          {false && (' },

  // ─── LE RÉGLAGE ─────────────────────────────────────────────────────────
  { nom: '🔴 le réglage relit la fiche chargée au démarrage', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    supabase.from('commercants').select('rdv_cadence_couverts').eq('id', commercantId).maybeSingle()",
    vers: '    Promise.resolve({ data: null, error: null })' },
  { nom: '🔴 le réglage écrit la saisie brute', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      .update({ rdv_cadence_couverts: verdict.valeur }).eq('id', commercantId)",
    vers: "      .update({ rdv_cadence_couverts: saisie }).eq('id', commercantId)" },
  { nom: '🔴 le réglage dit « enregistrée » sans lire l’écriture', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    if (error) return toast(`Erreur : ${error.message}. Ta cadence n’a pas changé.`, 'error')",
    vers: '' },
  { nom: '⚠️ le réglage disparaît de l’écran', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        <ReglageCadence commercantId={commercantId} toast={toast} />',
    vers: '        null' },

  // ─── LA MIGRATION ───────────────────────────────────────────────────────
  { nom: '🔴 la base et l’écran divergent sur les bornes', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: '  CHECK (rdv_cadence_couverts IS NULL OR rdv_cadence_couverts BETWEEN 1 AND 200);',
    vers: '  CHECK (rdv_cadence_couverts IS NULL OR rdv_cadence_couverts BETWEEN 1 AND 100);' },
  { nom: '⚠️ la colonne naît avec une valeur : tout le parc change', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: '  ADD COLUMN IF NOT EXISTS rdv_cadence_couverts integer;',
    vers: '  ADD COLUMN IF NOT EXISTS rdv_cadence_couverts integer DEFAULT 12;' },
  { nom: '🔴 la vue perd une colonne en route', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: '    boutique_delai_heures, bons_cadeaux_actif, essai_plan, rdv_horizon_jours,',
    vers: '    boutique_delai_heures, bons_cadeaux_actif, rdv_horizon_jours,' },
  { nom: '🔴 la garde contre une vue dérivée saute', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: "  IF vivant IS DISTINCT FROM attendu AND vivant IS DISTINCT FROM attendu || ',rdv_cadence_couverts' THEN",
    vers: '  IF false THEN' },
  { nom: '🔴 le calendrier change de noms d’arguments', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: 'CREATE FUNCTION public.rdv_slots_busy_range(p_commercant_id uuid, p_date_start date, p_date_end date)',
    vers: 'CREATE FUNCTION public.rdv_slots_busy_range(p_commercant_id uuid, p_debut date, p_fin date)' },
  { nom: '🔴 la fonction publique ne lit pas les couverts', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: '  SELECT heure_debut, heure_fin, praticien_id, prestation_id, place_no, couverts',
    vers: '  SELECT heure_debut, heure_fin, praticien_id, prestation_id, place_no, 1' },
  { nom: '🔴 une donnée personnelle sort de la fonction publique', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: '  SELECT date_rdv, heure_debut, heure_fin, praticien_id, prestation_id, place_no, couverts',
    vers: '  SELECT date_rdv, heure_debut, heure_fin, praticien_id, prestation_id, place_no, couverts, client_email' },
  { nom: '🔴 les droits de la fonction ne sont pas reposés', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: 'GRANT EXECUTE ON FUNCTION public.rdv_slots_busy(uuid, date) TO anon, authenticated, service_role;',
    vers: '' },
  { nom: '🔴 la vue redevient modifiable', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: 'REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;',
    vers: '' },
  { nom: '⚠️ la migration n’est plus une transaction', fichier: 'migrations/MIGRATION_CADENCE_CUISINE.sql',
    de: 'BEGIN;',
    vers: '' },
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

// Filtre facultatif : `node scripts/mutations-cadence.mjs verif:table`
const seul = process.argv[2] || null
const LISTE = (seul ? MUTATIONS.filter(m => (m.banc || BANC) === seul) : MUTATIONS)
const BANCS = [...new Set(LISTE.map(m => m.banc || BANC))]

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
  // ⚠️ UNE ANCRE QUI APPARAÎT DEUX FOIS MUTE LES DEUX : la garde mesurée ne
  // serait pas celle qu'on croit. On le refuse plutôt que de le découvrir.
  if (original.split(m.de).length !== 2) {
    manquees.push(`${m.nom} — ANCRE NON UNIQUE`)
    console.log(`  ! ${m.nom} — ancre non unique`)
    continue
  }
  ecrireSur(f, original.split(m.de).join(m.vers))
  const r = lancer(m.banc || BANC)
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
