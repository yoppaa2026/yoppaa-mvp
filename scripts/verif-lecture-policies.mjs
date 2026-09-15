// BANC : TOUTE LECTURE DES POLICIES RAMÈNE LEUR TYPE (15/09).
//
// 🔴 CE BANC EXISTE POUR UN PIÈGE TOMBÉ TROIS FOIS (24/08, 12/09, 15/09).
// Une policy est PERMISSIVE par défaut et son type ne se voit pas dans `qual`.
// Le 15/09 au soir, un relevé sans la colonne `permissive` m'a fait sonner une
// alerte sur `zz_commerce_ouvert`, qui est RESTRICTIVE sur ses 43 tables. Et
// ses deux comptages « au moins une policy permet de LIRE / de FERMER »
// comptaient cette RESTRICTIVE, qui n'accorde rien : ils pouvaient dire « 1 »
// là où personne ne peut rien.
//
// ⚠️ LA RÈGLE EST TOTALE : toute lecture de `pg_policies` nomme `permissive`,
// toute lecture de `pg_policy` nomme `polpermissive`, jugée dans SA
// sous-requête (voir `lire-sql.mjs`). Un comptage, un EXISTS, une liste de noms
// trompent autant qu'une condition lue sans son type.
//
// ⚠️ LES ARCHIVES SONT FIGÉES, PAS EXEMPTÉES. 76 lectures sans type dorment dans
// 31 fichiers déjà passés : des migrations appliquées et des diagnostics datés.
// Les réécrire fausserait ce qui a été exécuté, et leurs conclusions de
// sécurité ont été relues AVEC le type le 12/09 (CONTROLE_POLICIES_PERMISSIVE)
// et le 15/09 (C08). Chaque fichier garde son nombre EXACT : pas une lecture de
// plus, et un nombre qui baisse doit être baissé ici. Les contrôles faits pour
// être RELANCÉS (CONTROLE_SECURITE_*, DIAGNOSTIC_SECURITE…) ont été corrigés.
//
//   npm run verif:policies

import { readFileSync, readdirSync } from 'node:fs'
import { lecturesDePolicies, sansProseSql } from './lire-sql.mjs'

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE LECTEUR, EXÉCUTÉ SUR DES REQUÊTES ÉCRITES POUR LE PIÉGER
// ═══════════════════════════════════════════════════════════════════════════

const types = (sql) => lecturesDePolicies(sql).lectures.map(l => l.typeNomme)
const cas = (nom, sql, attendu) => {
  const obtenu = types(sql)
  verifie(nom, JSON.stringify(obtenu) === JSON.stringify(attendu),
    `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`)
}

cas('la sous-requête qui ramène le type passe',
  "SELECT 'C1', (SELECT string_agg(policyname || ' ' || permissive, ',') FROM pg_policies WHERE tablename = 'x')::text;",
  [true])
cas('🔴 la condition lue sans le type est prise',
  "SELECT 'C1', (SELECT string_agg(qual, ',') FROM pg_policies WHERE tablename = 'x')::text;",
  [false])
cas('🔴 un comptage sans type est pris : une RESTRICTIVE n accorde rien',
  "SELECT (SELECT count(*) FROM pg_policies WHERE cmd IN ('SELECT', 'ALL'))::text;",
  [false])
cas('🔴 le mot écrit dans une chaîne ne vaut pas la colonne',
  "SELECT (SELECT COALESCE(string_agg(qual, ','), 'aucune PERMISSIVE') FROM pg_policies)::text;",
  [false])
cas('🔴 le mot écrit dans un commentaire ne vaut pas la colonne',
  'SELECT policyname, qual -- permissive, a ajouter\nFROM pg_policies;',
  [false])
cas('🔴 un commentaire de bloc IMBRIQUÉ reste un commentaire jusqu au bout',
  'SELECT policyname, qual /* a /* permissive */ encore permissive */ FROM pg_policies;',
  [false])
cas('une requête en commentaire n est pas une lecture',
  '-- SELECT policyname, qual FROM pg_policies;\n/* SELECT qual FROM pg_policies; */\nSELECT 1;',
  [])
cas('🔴 une lecture dans un bloc DO $$ … $$ est vue',
  "DO $$\nDECLARE r record;\nBEGIN\n  FOR r IN SELECT tablename, qual FROM pg_policies LOOP\n    RAISE NOTICE '%', r.tablename;\n  END LOOP;\nEND\n$$;",
  [false])
cas('🔴 deux branches d UNION se jugent séparément',
  "SELECT policyname, permissive FROM pg_policies WHERE tablename = 'a'\nUNION ALL\nSELECT policyname, qual FROM pg_policies WHERE tablename = 'b';",
  [true, false])
cas('🔴 deux sous-requêtes d une même ligne se jugent séparément',
  "SELECT (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE') FROM pg_policies)::text, (SELECT count(*) FROM pg_policies WHERE cmd = 'ALL')::text;",
  [true, false])
cas('deux requêtes séparées par un point-virgule se jugent séparément',
  'SELECT policyname, permissive FROM pg_policies;\nSELECT policyname, qual FROM pg_policies;',
  [true, false])
cas('la CTE qui ramène le type passe',
  "WITH pol AS (SELECT tablename, permissive::text AS type, qual FROM pg_policies) SELECT * FROM pol WHERE type = 'PERMISSIVE';",
  [true])
cas('SELECT * montre le type',
  "SELECT * FROM pg_policies WHERE tablename = 'x';",
  [true])
cas('🔴 count(*) n est pas un SELECT *',
  'SELECT count(*) FROM pg_policies;',
  [false])
cas('🔴 un nom qui CONTIENT le mot ne vaut pas la colonne',
  'SELECT count(*) AS nb_permissives FROM pg_policies;',
  [false])
cas('le type qualifié par un alias passe',
  'SELECT p.policyname, p.permissive FROM pg_policies p;',
  [true])
cas('🔴 le catalogue brut pg_policy est gardé aussi',
  "SELECT 1 FROM pg_policy pol WHERE pol.polrelid = 'public.x'::regclass;",
  [false])
cas('le catalogue brut avec polpermissive passe',
  'SELECT pol.polname, pol.polpermissive FROM pg_policy pol;',
  [true])
cas('un nom qui commence par pg_policies n est pas le catalogue',
  'SELECT qual FROM pg_policies_sauvegarde;',
  [])
cas("🔴 une chaîne E'…' échappée ne rouvre pas le code",
  "SELECT (SELECT count(*) FROM pg_policies WHERE policyname = E'l\\'admin')::text, 'permissive'::text;",
  [false])

{
  const r = lecturesDePolicies('/* un\ndeux */\nSELECT qual FROM pg_policies;')
  verifie('la ligne annoncée est la bonne, après un commentaire sur deux lignes',
    r.lectures[0]?.ligne === 3, JSON.stringify(r.lectures))
  verifie('le dépouillement garde chaque position',
    sansProseSql("SELECT 'é🔴' -- x\n").length === "SELECT 'é🔴' -- x\n".length)
  verifie('un fichier sain ne signale rien', r.nonFerme === null && r.desequilibre === null,
    `${r.nonFerme} / ${r.desequilibre}`)
}
verifie('🔴 une chaîne jamais fermée est signalée',
  Boolean(lecturesDePolicies("SELECT 'oops FROM pg_policies;").nonFerme))
verifie('🔴 une parenthèse jamais fermée est signalée',
  Boolean(lecturesDePolicies('SELECT (SELECT 1 FROM pg_policies;').desequilibre))

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE DÉPÔT
// ═══════════════════════════════════════════════════════════════════════════

// Relevé du 15/09 : le nombre EXACT de lectures sans type, fichier par fichier.
const ARCHIVES = {
  'DIAGNOSTIC_ADMIN_ET_RDV.sql': 2,
  'DIAGNOSTIC_DEMANDES_COMMANDE_RESTE.sql': 1,
  'DIAGNOSTIC_ECRITURE_ANON.sql': 9,
  'DIAGNOSTIC_ECRITURE_ANON_2.sql': 5,
  'DIAGNOSTIC_FONCTIONS_DE_POLICIES.sql': 1,
  'DIAGNOSTIC_IS_ADMIN.sql': 2,
  'DIAGNOSTIC_RLS_TABLES.sql': 4,
  'MIGRATION_ADMIN_RLS.sql': 1,
  'MIGRATION_CATALOGUE_NON_PUBLIE.sql': 3,
  'MIGRATION_CLIENTS_INSERTION.sql': 4,
  'MIGRATION_CRENEAUX_BLOCAGE.sql': 2,
  'MIGRATION_FIDELITE_SERVEUR.sql': 1,
  'MIGRATION_NETTOYAGE_DROITS_ANON.sql': 2,
  'MIGRATION_PRATICIENS_LIENS_POLICY.sql': 4,
  'MIGRATION_PRE_INSCRIPTIONS.sql': 1,
  'MIGRATION_RDV_CRENEAU_PRESTATIONS.sql': 3,
  'MIGRATION_RDV_INSERTION_PUBLIQUE.sql': 6,
  'MIGRATION_RDV_LISTE_ATTENTE.sql': 1,
  'MIGRATION_RDV_SUPPRESSION_ET_ANON.sql': 5,
  'MIGRATION_RDV_UPDATE_CLIENT.sql': 4,
  'MIGRATION_RLS_CRENEAUX.sql': 1,
  'MIGRATION_RLS_ECRITURES.sql': 1,
  'MIGRATION_RLS_ECRITURES_YOPPER.sql': 1,
  'MIGRATION_RLS_LECTURES_RESIDUELLES.sql': 2,
  'MIGRATION_RLS_LIGNES_COMMERCANT.sql': 1,
  'MIGRATION_RLS_RDV_PUBLIC.sql': 1,
  'MIGRATION_RLS_SIGNALEMENTS.sql': 1,
  'MIGRATION_SECURITE_21_08.sql': 2,
  'MIGRATION_SECURITE_LECTURES_PUBLIEES.sql': 1,
  'MIGRATION_SECURITE_LECTURES_PUBLIEES_2.sql': 2,
  'MIGRATION_VERROU_COMMERCANT_NON_VALIDE.sql': 2,
}

// ⚠️ UNE ARCHIVE NE GROSSIT JAMAIS. Sans ce plafond, il suffirait de monter le
// nombre d'un fichier pour y glisser une nouvelle lecture aveugle.
const figees = Object.values(ARCHIVES).reduce((a, b) => a + b, 0)
verifie('🔴 le total figé ne dépasse pas le relevé du 15/09', figees <= 76, `${figees} figées`)

const DIR = new URL('../migrations/', import.meta.url)
let lectures = 0
let fichiersLecteurs = 0
const archivesVues = new Set()

for (const f of readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()) {
  const r = lecturesDePolicies(readFileSync(new URL(f, DIR), 'utf8'))
  // 🔴 UN FICHIER MAL LU REND SES GARDES VERTES POUR RIEN : on l'exige lisible.
  verifie(`🔴 ${f} se lit jusqu au bout`, !r.nonFerme && !r.desequilibre, r.nonFerme || r.desequilibre)
  if (r.lectures.length === 0) continue
  fichiersLecteurs++
  lectures += r.lectures.length
  const sans = r.lectures.filter(l => !l.typeNomme)
  const detail = sans.map(l => `ligne ${l.ligne} : ${l.extrait}`).join(' | ')

  if (!(f in ARCHIVES)) {
    verifie(`🔴 ${f} : toute lecture des policies ramène leur type`, sans.length === 0, detail)
    continue
  }
  archivesVues.add(f)
  verifie(`🔴 ${f} (archive) : pas une lecture sans type de plus`, sans.length <= ARCHIVES[f],
    `${sans.length} au lieu de ${ARCHIVES[f]} : ${detail}`)
  verifie(`${f} (archive) : le nombre figé est à jour`, sans.length >= ARCHIVES[f],
    `il en reste ${sans.length}, figé à ${ARCHIVES[f]} : baisse-le ici, ou retire le fichier à zéro`)
}

for (const f of Object.keys(ARCHIVES)) {
  verifie(`l archive ${f} existe encore et lit toujours le catalogue`, archivesVues.has(f))
}

// ⚠️ UNE GARDE QUI NE TROUVE RIEN À GARDER EST VERTE POUR RIEN.
verifie('🔴 la sonde a réellement trouvé des lectures du catalogue', lectures >= 100,
  `${lectures} lecture(s) dans ${fichiersLecteurs} fichier(s)`)

console.log(`\nLecture des policies : ${ok} vérifications, ${lectures} lectures du catalogue dans ${fichiersLecteurs} fichiers, ${figees} figées en archive`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Toute lecture des policies ramène leur type.')
