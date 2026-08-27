// AUDIT : EST-CE QU'ON DEMANDE DES COLONNES QUI N'EXISTENT PAS ?
//
// 🔴 D'OÙ ÇA VIENT. Le 27/08, le mail « ton colis est prêt » ne partait pas.
// Cause : `commandes.client_prenom` n'existe pas — le nom complet vit dans
// `client_nom`. La colonne avait été recopiée depuis un select de
// `rdv_reservations`, table qui, elle, a bien les deux.
//
// ⚠️ ET CE N'EST PAS « LA COLONNE ABSENTE D'UN SELECT », C'EST SON CONTRAIRE.
// Une colonne qui EXISTE mais qu'on oublie de demander vaut `undefined` : la
// fonction rend son repli, personne ne voit rien. Une colonne qui N'EXISTE PAS
// fait échouer TOUTE la requête : PostgREST rend un 400, `data` vaut null, et
// la route en conclut que la ligne n'existe pas. **Le silence est le même, la
// cause est l'inverse, et le second est bien plus destructeur** : ce n'est pas
// une valeur qui manque, c'est la requête entière qui tombe.
//
// ⚠️ LE MÊME DÉFAUT AVAIT DÉJÀ ÉTÉ TROUVÉ LE 28/07 sur le récapitulatif du
// matin (« 0 commande » à des commerçants qui en avaient). Il avait été corrigé
// dans CETTE route-là, avec un commentaire qui expliquait tout. Cinq autres
// routes le portaient encore un mois plus tard : **un commentaire ne protège
// que le fichier qui le contient.**
//
// CE QUE FAIT CE SCRIPT
//
//   1. Il reconstruit le schéma à partir des migrations : `CREATE TABLE`,
//      `ALTER TABLE ... ADD COLUMN`, et les vues.
//   2. Il relève tous les `.from('table').select(...)` du dépôt.
//   3. Il confronte les deux.
//
// ⚠️ LE SCHÉMA VIENT DES MIGRATIONS, PAS DE LA BASE. C'est une approximation
// ASSUMÉE et il faut le dire : une table créée à la main dans la console
// Supabase n'y figure pas. D'où la séparation stricte du rapport :
//   • TABLE INCONNUE  → on ne sait pas, on ne juge pas. Ce n'est pas un défaut.
//   • COLONNE MANQUANTE sur une table connue → à regarder, une par une.
// Crier au loup sur ce qu'on ne connaît pas ferait ignorer le rapport entier.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// ─── 1. LE SCHÉMA, DEPUIS LES MIGRATIONS ────────────────────────────────────
const schema = new Map()   // table -> Set(colonnes)
// ⚠️ ON NE JUGE QU'UNE TABLE DONT ON A LU LE `CREATE TABLE`.
//
// Première version de ce script : 546 « colonnes manquantes », dont
// `actualites.id` et `articles.nom`. Évidemment fausses. La cause : une table
// dont seuls des `ALTER TABLE ... ADD COLUMN` figurent dans les migrations est
// connue PARTIELLEMENT — on tient les colonnes ajoutées, jamais celles de sa
// création. Tout le reste paraissait donc manquant.
//
// ⚠️ UN RAPPORT QUI CRIE AU LOUP NE SE LIT PAS. Cinq cent quarante-six lignes
// dont deux vraies, personne ne les regarde, et la deux-cent-douzième est le
// défaut qu'on cherchait. **Mieux vaut se taire sur ce qu'on ne sait pas que
// noyer ce qu'on sait.** C'est la même règle que « le silence quand le nombre
// ne parle pas » des signaux.
const tablesCompletes = new Set()
const ajoute = (table, col) => {
  if (!table || !col) return
  if (!schema.has(table)) schema.set(table, new Set())
  schema.get(table).add(col)
}

// ─── 0. LE SCHÉMA RÉEL, S'IL A ÉTÉ DÉPOSÉ ───────────────────────────────────
//
// 🔴 SANS LUI, CET AUDIT N'AURAIT PAS ATTRAPÉ LE DÉFAUT QUI L'A FAIT NAÎTRE.
// Vingt-quatre tables n'ont pas de `CREATE TABLE` dans les migrations — elles
// sont antérieures au dossier — et parmi elles : `commandes`, `commercants`,
// `articles`, `clients`. Or c'est `commandes.client_prenom` qui a cassé le mail
// du colis.
//
// ⚠️ UN OUTIL QUI RASSURE SANS PROTÉGER EST PIRE QUE PAS D'OUTIL. Tant que ce
// fichier n'est pas là, l'audit le DIT en toutes lettres au lieu d'afficher un
// vert trompeur.
//
// Pour le produire : `migrations/DIAGNOSTIC_COLONNES_MANQUANTES.sql`, bloc 1,
// résultat collé tel quel. Format, une ligne par table :
//     commandes: bon_cadeau_montant,client_email,client_nom,...
const cheminSchemaReel = join(racine, 'scripts', 'schema-supabase.txt')
let schemaReel = null
try {
  schemaReel = readFileSync(cheminSchemaReel, 'utf8')
} catch (e) { /* pas encore déposé : on retombe sur les migrations */ }

const dirMigrations = join(racine, 'migrations')
for (const f of readdirSync(dirMigrations)) {
  if (extname(f).toLowerCase() !== '.sql') continue
  const sql = readFileSync(join(dirMigrations, f), 'utf8')
    // ⚠️ ON DÉPOUILLE LES COMMENTAIRES SQL, Y COMPRIS EN FIN DE LIGNE.
    //
    // Première version : `/^\s*--.*$/gm`, qui ne retire que les commentaires
    // occupant TOUTE une ligne. Or une définition de vue s'annote volontiers
    // en bout de ligne :
    //
    //     numero_prefixe,   -- CC | LI | EX | RE, posé par le déclencheur
    //     numero_semaine    -- 'IYYY-IW', la semaine de RETRAIT
    //
    // Le commentaire du dessus contient des VIRGULES : le découpage voyait donc
    // « numero_semaine » collé à du texte, et le déclarait absent. L'audit m'a
    // fait croire à un défaut dans une vue DÉJÀ corrigée, et j'ai failli écrire
    // une migration pour rien.
    //
    // ⚠️ UN OUTIL DE VÉRIFICATION QUI SE TROMPE COÛTE PLUS CHER QU'UN OUTIL
    // ABSENT : on agit sur ce qu'il dit.
    .replace(/--[^\n]*/g, ' ')

  // CREATE TABLE x ( col type, col type, ... )
  for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    const table = m[1].toLowerCase()
    tablesCompletes.add(table)
    for (const ligne of m[2].split('\n')) {
      const t = ligne.trim()
      if (!t || /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i.test(t)) continue
      const col = t.match(/^([a-z_][a-z0-9_]*)\s+/i)
      if (col) ajoute(table, col[1].toLowerCase())
    }
  }

  // ALTER TABLE x ADD COLUMN [IF NOT EXISTS] col ... (plusieurs par instruction)
  for (const m of sql.matchAll(/ALTER TABLE\s+(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi)) {
    const table = m[1].toLowerCase()
    for (const c of m[2].matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)) {
      ajoute(table, c[1].toLowerCase())
    }
  }

  // CREATE VIEW x AS SELECT a, b, c FROM ...
  for (const m of sql.matchAll(/CREATE(?:\s+OR REPLACE)?\s+VIEW\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+AS\s+SELECT([\s\S]*?)\sFROM\s/gi)) {
    const vue = m[1].toLowerCase()
    // Une vue est TOUJOURS complète : sa définition liste ses colonnes.
    tablesCompletes.add(vue)
    for (const brut of m[2].split(',')) {
      // « x AS y » expose `y` ; sinon le nom lui-même.
      const alias = brut.match(/\bAS\s+([a-z_][a-z0-9_]*)\s*$/i)
      const nu = brut.trim().match(/^([a-z_][a-z0-9_]*)$/i)
      if (alias) ajoute(vue, alias[1].toLowerCase())
      else if (nu) ajoute(vue, nu[1].toLowerCase())
    }
  }
}

// ⚠️ LE SCHÉMA RÉEL A LE DERNIER MOT, et il REMPLACE ce qui précède plutôt que
// de s'y ajouter : une table présente en base avec dix colonnes est décrite
// exactement par ces dix colonnes. Les compléter avec ce que disent les
// migrations rouvrirait la porte aux colonnes supprimées depuis.
if (schemaReel) {
  schema.clear()
  tablesCompletes.clear()
  for (const ligne of schemaReel.split('\n')) {
    const m = ligne.match(/^\s*([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*$/i)
    if (!m) continue
    const table = m[1].toLowerCase()
    tablesCompletes.add(table)
    for (const col of m[2].split(',')) {
      const c = col.trim().toLowerCase()
      if (/^[a-z_][a-z0-9_]*$/.test(c)) ajoute(table, c)
    }
  }
}

// ─── 2. TOUS LES SELECT DU DÉPÔT ────────────────────────────────────────────
const fichiers = []
;(function parcourir(dir) {
  for (const nom of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'public'].includes(nom)) continue
    const p = join(dir, nom)
    if (statSync(p).isDirectory()) parcourir(p)
    else if (['.js', '.mjs'].includes(extname(nom))) fichiers.push(p)
  }
})(racine)

// ⚠️ ON DÉPOUILLE LES COMMENTAIRES, TOUJOURS. Un select cité en exemple dans
// une explication n'est pas un select exécuté, et le piège s'est déjà présenté
// trois fois sur ce projet — dans les deux sens.
const codeSeul = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')

// ─── CE QUI A ÉTÉ REGARDÉ ET N'EST PAS UN DÉFAUT ────────────────────────────
//
// ⚠️ UN AUDIT SE SOLDE À ZÉRO. Une liste qui reste rouge éternellement finit
// par ne plus être lue, et le jour où une VRAIE ligne s'y ajoute, personne ne
// la voit. Chaque entrée ci-dessous a donc été OUVERTE, et porte sa raison.
//
// ⚠️ CE N'EST PAS UNE LISTE D'EXCEPTIONS, C'EST UNE LISTE DE LIMITES DE
// L'OUTIL. Aucune n'excuse un défaut : elles disent toutes que l'analyseur
// s'est trompé, jamais que le code a raison d'être faux.
const VERIFIEES = {
  // Mon analyseur de vues découpe la liste des colonnes sur les virgules. Une
  // sous-requête ou une expression en contient : il ne voit alors que des
  // fragments, et croit la colonne absente. Les définitions ont été relues.
  'commune_stats.active':            'vue : colonnes préfixées `c.`, l’analyseur ne lit que les noms nus',
  'commune_stats.nom':               'idem',
  'commune_stats.province':          'idem',
  'commune_stats.seuil_preinscrits': 'idem',
  'signaux_envies_stats.derniere':   'vue : sous-requête `( … ) AS derniere`, virgules internes',
  'signaux_envies_stats.soir_30j':   'idem',
  'signaux_envies_stats.weekend_30j':'idem',
}

// ⚠️ ET CE QUI RESTE DOUTEUX, PARCE QUE LES MIGRATIONS NE SUFFISENT PAS.
// Ces colonnes n'apparaissent nulle part dans le dépôt, mais le code qui les
// lit fonctionne en production : elles auraient été ajoutées à la main dans la
// console Supabase. **On ne les déclare ni vertes ni rouges tant qu'on n'a pas
// interrogé la BASE**, et la requête qui tranche est dans
// `migrations/DIAGNOSTIC_COLONNES_MANQUANTES.sql`.
//
// ⚠️ VIDÉE LE 27/08, ET C'EST UNE BONNE NOUVELLE : les trois entrées ont été
// tranchées en base. `annulation_token` et `slug_kit` existent vraiment, le
// schéma réel les porte, l'exception ne servait plus à rien.
// `rdv_fidelite_progression.nb_rdv_total` n'existait pas, et sa table entière
// a été retirée avec l'ancienne fidélité des rendez-vous.
//
// ⚠️ UNE EXCEPTION QUI SURVIT À SON MOTIF DEVIENT UN TROU : le jour où l'un de
// ces noms revient sous une autre forme, l'audit le laisserait passer en
// silence. Une liste d'exceptions se solde, comme un audit.
const A_CONFIRMER_EN_BASE = {}

const manquantes = []
const aConfirmer = []
const excusees = []
const tablesInconnues = new Set()
let selectsLus = 0

for (const chemin of fichiers) {
  const rel = chemin.slice(racine.length).replace(/\\/g, '/')
  // Le script d'audit lui-même et les bancs citent des colonnes pour les tester.
  if (/\/scripts\/(audit-colonnes-select|verif-)/.test(rel)) continue
  const src = codeSeul(readFileSync(chemin, 'utf8'))

  // `.from('table')` ... `.select(<chaîne ou gabarit>)`
  for (const m of src.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)([\s\S]{0,80}?)\.select\(\s*(`[\s\S]*?`|'[^']*'|"[^"]*")/g)) {
    const table = m[1]
    const liste = m[3].slice(1, -1)
    selectsLus++
    if (liste.trim() === '*') continue
    // ⚠️ CONNUE PARTIELLEMENT = PAS JUGÉE. Voir `tablesCompletes` plus haut :
    // une table dont on n'a lu que des `ADD COLUMN` ferait passer toutes ses
    // colonnes d'origine pour des inventions.
    if (!tablesCompletes.has(table)) { tablesInconnues.add(table); continue }
    const connues = schema.get(table)

    // ⚠️ ON NE GARDE QUE LES COLONNES DE PREMIER NIVEAU. `commercant:commercants(nom)`
    // est une RELATION : ses colonnes appartiennent à l'autre table, et
    // `commercant` n'est qu'un alias. Les compter ici produirait des faux
    // positifs en pagaille, et un rapport bruyant ne se lit pas.
    const sansRelations = liste.replace(/[a-z_][a-z0-9_]*\s*:\s*[a-z_][a-z0-9_!.]*\s*\([^()]*\)/gi, ' ')
                               .replace(/[a-z_][a-z0-9_]*\s*\([^()]*\)/gi, ' ')
    for (const brut of sansRelations.split(',')) {
      const col = brut.trim().replace(/\s+/g, '')
      if (!col || !/^[a-z_][a-z0-9_]*$/.test(col)) continue
      if (connues.has(col)) continue
      const cle = `${table}.${col}`
      if (VERIFIEES[cle]) { excusees.push(cle); continue }
      if (A_CONFIRMER_EN_BASE[cle]) { aConfirmer.push({ rel, cle }); continue }
      manquantes.push({ rel, table, col })
    }
  }
}

// ─── 3. LE RAPPORT ──────────────────────────────────────────────────────────
console.log(schemaReel
  ? `\nSchéma : LU EN BASE — ${tablesCompletes.size} tables et vues.`
  : `\nSchéma : reconstruit depuis les MIGRATIONS — ${tablesCompletes.size} complètes sur ${schema.size}.`)
console.log(`Selects relevés : ${selectsLus}\n`)

if (!schemaReel) {
  console.log('🔴 LE SCHÉMA RÉEL N’A PAS ÉTÉ DÉPOSÉ, ET CET AUDIT EST DONC INCOMPLET.')
  console.log('   Les tables antérieures au dossier `migrations/` ne sont pas jugées,')
  console.log('   et `commandes` en fait partie : c’est pourtant elle qui a cassé le')
  console.log('   mail du colis le 27/08. Un vert ici ne prouve pas grand-chose.')
  console.log('   → migrations/DIAGNOSTIC_COLONNES_MANQUANTES.sql, bloc 1,')
  console.log('     résultat collé dans scripts/schema-supabase.txt.\n')
}

if (tablesInconnues.size > 0) {
  console.log(`⏭️  ${tablesInconnues.size} tables dont le CREATE TABLE n'est pas dans les`)
  console.log(`   migrations : NON JUGÉES, ni vertes ni rouges.`)
  console.log(`   ${[...tablesInconnues].sort().join(', ')}\n`)
}

if (excusees.length > 0) {
  console.log(`✅ ${new Set(excusees).size} signalements ouverts et écartés (limites de l'analyseur).`)
}
if (aConfirmer.length > 0) {
  console.log(`\n⏳ ${new Set(aConfirmer.map(a => a.cle)).size} colonne(s) À CONFIRMER EN BASE :`)
  for (const cle of [...new Set(aConfirmer.map(a => a.cle))].sort()) {
    console.log(`   • ${cle} — ${A_CONFIRMER_EN_BASE[cle]}`)
  }
  console.log('   → migrations/DIAGNOSTIC_COLONNES_MANQUANTES.sql tranche.')
}

if (manquantes.length === 0) {
  console.log('\n✅ Aucune colonne demandée qui n’existe pas, sur les tables connues.')
  process.exit(0)
}

console.log(`🔴 ${manquantes.length} colonne(s) demandée(s) et absente(s) du schéma :\n`)
const parTable = new Map()
for (const m of manquantes) {
  const cle = `${m.table}.${m.col}`
  if (!parTable.has(cle)) parTable.set(cle, [])
  parTable.get(cle).push(m.rel)
}
for (const [cle, fichiers] of [...parTable].sort()) {
  console.log(`  ✕ ${cle}`)
  for (const f of [...new Set(fichiers)]) console.log(`      ${f}`)
}
console.log('\n⚠️ À VÉRIFIER UNE PAR UNE : le schéma vient des migrations, pas de')
console.log('   la base. Une colonne ajoutée à la main n’y figure pas.')
process.exit(1)
